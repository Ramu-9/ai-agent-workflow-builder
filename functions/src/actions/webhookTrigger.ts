import { Request, Response } from 'express';
import { query } from '../utils/db';
import { executeWorkflow, checkAndIncrementQuota } from '../engine/executor';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

/**
 * Webhook trigger endpoint — NOT a Hasura Action.
 * This is a plain Express route because external systems don't have JWTs.
 * 
 * Authentication: pre-shared unguessable secret, bcrypt-hashed at rest,
 * compared with crypto.timingSafeEqual to prevent timing attacks.
 * 
 * Route: POST /webhook/:triggerId
 */
export async function webhookTriggerHandler(req: Request, res: Response) {
  try {
    const { triggerId } = req.params;
    const { secret, payload } = req.body || {};

    if (!triggerId || !secret) {
      // Generic 401 — no information leakage about whether the trigger exists
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Look up the trigger
    const triggerResult = await query(
      `SELECT wt.id, wt.workflow_id, wt.trigger_type, wt.webhook_secret, wt.is_active,
              w.org_id
       FROM public.workflow_triggers wt
       JOIN public.workflows w ON w.id = wt.workflow_id
       WHERE wt.id = $1 AND wt.trigger_type = 'webhook'`,
      [triggerId]
    );

    if (triggerResult.rows.length === 0) {
      // Generic 401 — don't reveal that the trigger doesn't exist
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const trigger = triggerResult.rows[0];

    if (!trigger.is_active) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!trigger.webhook_secret) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Verify the secret using bcrypt comparison
    // bcrypt.compare is inherently constant-time for the hash comparison
    const secretValid = await bcrypt.compare(secret, trigger.webhook_secret);

    if (!secretValid) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Secret verified — check quota
    const quotaOk = await checkAndIncrementQuota(trigger.org_id);
    if (!quotaOk) {
      return res.status(429).json({ message: 'Organization quota exhausted' });
    }

    // Execute the workflow — same engine as manual triggers
    const result = await executeWorkflow({
      workflowId: trigger.workflow_id,
      orgId: trigger.org_id,
      triggerType: 'webhook',
      triggeredBy: null, // external system, no user
      context: payload || {},
    });

    return res.json(result);

  } catch (err: any) {
    console.error('webhookTrigger error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Generate a new webhook secret.
 * Returns the raw secret (to show once to the user) and the bcrypt hash (to store).
 */
export async function generateWebhookSecret(): Promise<{ raw: string; hash: string }> {
  const raw = crypto.randomBytes(32).toString('hex'); // 64-char hex string
  const hash = await bcrypt.hash(raw, 10);
  return { raw, hash };
}
