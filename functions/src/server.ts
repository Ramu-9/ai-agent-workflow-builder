import express from 'express';
import cors from 'cors';
import { triggerWorkflowRunHandler } from './actions/triggerWorkflowRun';
import { approveStepHandler } from './actions/approveStep';
import { webhookTriggerHandler, generateWebhookSecret } from './actions/webhookTrigger';
import { cronRunnerHandler } from './scheduled/cronRunner';
import { dbEventHandler } from './events/dbEventHandler';
import { query } from './utils/db';
import { extractSession, getUserId, verifyOrgMembership, getWorkflowOrgId, AuthError } from './utils/auth';
import * as bcrypt from 'bcryptjs';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// Hasura Action Handlers
// ============================================================

// triggerWorkflowRun — called by Hasura as an Action
app.post('/actions/triggerWorkflowRun', triggerWorkflowRunHandler);

// approveStep — called by Hasura as an Action
app.post('/actions/approveStep', approveStepHandler);

// ============================================================
// Webhook Trigger — plain Express route (NOT a Hasura Action)
// External systems call this with a pre-shared secret
// ============================================================

app.post('/webhook/:triggerId', webhookTriggerHandler);

// ============================================================
// Hasura Cron Trigger Handler
// ============================================================

app.post('/scheduled/cronRunner', cronRunnerHandler);

// ============================================================
// Hasura Event Trigger Handlers
// ============================================================

app.post('/events/dbEvent', dbEventHandler);

// Notification delivery event handler (for notify steps)
app.post('/events/notificationDelivery', async (req, res) => {
  try {
    const event = req.body.event;
    if (!event || !event.data || !event.data.new) {
      return res.json({ message: 'No event data' });
    }

    const notification = event.data.new;
    
    // For now, just mark as sent (in production, integrate with email/Slack API)
    console.log(`[NOTIFICATION] Channel: ${notification.channel}, To: ${notification.recipient}, Subject: ${notification.subject}`);
    console.log(`[NOTIFICATION] Body: ${notification.body}`);

    await query(
      `UPDATE public.notifications SET status = 'sent' WHERE id = $1`,
      [notification.id]
    );

    return res.json({ message: 'Notification processed', id: notification.id });
  } catch (err: any) {
    console.error('Notification delivery error:', err);
    return res.status(500).json({ message: err.message });
  }
});

// ============================================================
// Auth / Org Management Endpoints
// ============================================================

// Switch org context — issues updated metadata for token refresh
app.post('/auth/switch-org', async (req, res) => {
  try {
    const { user_id, org_id } = req.body;

    if (!user_id || !org_id) {
      return res.status(400).json({ message: 'user_id and org_id required' });
    }

    // Verify membership
    const result = await query(
      'SELECT role FROM public.org_members WHERE user_id = $1 AND org_id = $2',
      [user_id, org_id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: 'Not a member of this organization' });
    }

    const role = result.rows[0].role;

    // Update user metadata with the selected org context
    // This metadata feeds into JWT custom claims via AUTH_JWT_CUSTOM_CLAIMS
    await query(
      `UPDATE auth.users
       SET metadata = jsonb_set(
         jsonb_set(
           COALESCE(metadata, '{}'),
           '{org_id}', to_jsonb($2::text)
         ),
         '{org_role}', to_jsonb($3::text)
       )
       WHERE id = $1`,
      [user_id, org_id, role]
    );

    return res.json({
      success: true,
      org_id,
      role,
      message: 'Org context updated. Refresh your token to get updated claims.',
    });
  } catch (err: any) {
    console.error('switch-org error:', err);
    return res.status(500).json({ message: err.message });
  }
});

// Get user's organizations
app.post('/auth/my-orgs', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ message: 'user_id required' });
    }

    const result = await query(
      `SELECT om.org_id, om.role, o.name, o.slug
       FROM public.org_members om
       JOIN public.organizations o ON o.id = om.org_id
       WHERE om.user_id = $1
       ORDER BY o.name`,
      [user_id]
    );

    return res.json({ orgs: result.rows });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// Create webhook trigger with generated secret
app.post('/actions/createWebhookTrigger', async (req, res) => {
  try {
    const { input, session_variables } = req.body;
    const { workflow_id } = input;

    if (!workflow_id) {
      return res.status(400).json({ message: 'workflow_id is required' });
    }

    const session = session_variables || {};
    const userId = getUserId(session);
    const orgId = await getWorkflowOrgId(workflow_id);

    // Only owners can create webhook triggers (Layer 2 check)
    await verifyOrgMembership(userId, orgId, ['owner']);

    // Generate secret
    const { raw, hash } = await generateWebhookSecret();

    // Insert trigger with hashed secret
    const result = await query(
      `INSERT INTO public.workflow_triggers (workflow_id, trigger_type, config, webhook_secret, is_active)
       VALUES ($1, 'webhook', $2, $3, true)
       RETURNING id`,
      [workflow_id, JSON.stringify(input.config || {}), hash]
    );

    // Return the raw secret ONCE — it will never be queryable again
    return res.json({
      trigger_id: result.rows[0].id,
      webhook_secret: raw, // shown once, then never returned
      webhook_url: `/webhook/${result.rows[0].id}`,
      message: 'Save this secret — it cannot be retrieved again.',
    });

  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return res.status(500).json({ message: err.message });
  }
});

// ============================================================
// Start server
// ============================================================

app.listen(PORT, () => {
  console.log(`Functions server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/healthz`);
});

export default app;
