import { query } from '../../utils/db';

export interface NotifyConfig {
  channel?: 'email' | 'slack' | 'webhook';
  recipient: string;
  subject?: string;
  body_template?: string;
}

/**
 * Create a notification record. The actual delivery is handled by a 
 * Hasura Event Trigger on the notifications table.
 * 
 * This is NOT a stub — the notification row is real, and the event trigger
 * fires asynchronously to handle delivery.
 */
export async function executeNotify(
  config: NotifyConfig,
  previousOutput: any,
  context: {
    orgId: string;
    workflowRunId: string;
    stepRunId: string;
  }
): Promise<any> {
  const channel = config.channel || 'email';
  const recipient = config.recipient;
  const subject = config.subject || 'Workflow Notification';

  // Interpolate body template
  let body = config.body_template || `Workflow step completed. Output: ${JSON.stringify(previousOutput)}`;
  if (previousOutput) {
    body = body.replace(/\{\{previous_output\.(\w+)\}\}/g, (_match, key) => {
      return previousOutput[key] !== undefined ? String(previousOutput[key]) : '';
    });
    body = body.replace(/\{\{previous_output\}\}/g, JSON.stringify(previousOutput));
  }

  const result = await query(
    `INSERT INTO public.notifications (org_id, workflow_run_id, step_run_id, channel, recipient, subject, body)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, status, created_at`,
    [context.orgId, context.workflowRunId, context.stepRunId, channel, recipient, subject, body]
  );

  return {
    notification_id: result.rows[0].id,
    channel,
    recipient,
    status: result.rows[0].status,
    queued_at: result.rows[0].created_at,
  };
}
