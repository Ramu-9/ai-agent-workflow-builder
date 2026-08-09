import { Request, Response } from 'express';
import { query } from '../utils/db';
import { executeWorkflow, checkAndIncrementQuota } from '../engine/executor';

/**
 * Hasura Cron Trigger handler: runs on a schedule to check for 
 * active scheduled triggers and execute their workflows.
 * 
 * Called by Hasura Cron Trigger with admin secret — no user JWT.
 */
export async function cronRunnerHandler(req: Request, res: Response) {
  try {
    // Find all active scheduled triggers
    const result = await query(
      `SELECT wt.id, wt.workflow_id, wt.config, w.org_id
       FROM public.workflow_triggers wt
       JOIN public.workflows w ON w.id = wt.workflow_id
       WHERE wt.trigger_type = 'scheduled'
         AND wt.is_active = true
         AND w.is_active = true`
    );

    const triggered: string[] = [];
    const errors: string[] = [];

    for (const trigger of result.rows) {
      try {
        // Check quota before executing
        const quotaOk = await checkAndIncrementQuota(trigger.org_id);
        if (!quotaOk) {
          errors.push(`Trigger ${trigger.id}: quota exhausted for org ${trigger.org_id}`);
          continue;
        }

        const execResult = await executeWorkflow({
          workflowId: trigger.workflow_id,
          orgId: trigger.org_id,
          triggerType: 'scheduled',
          triggeredBy: null,
          context: { scheduled_trigger_id: trigger.id },
        });

        triggered.push(`${trigger.id}: ${execResult.status}`);
      } catch (err: any) {
        errors.push(`Trigger ${trigger.id}: ${err.message}`);
      }
    }

    return res.json({
      triggered_count: triggered.length,
      triggered,
      errors,
    });

  } catch (err: any) {
    console.error('cronRunner error:', err);
    return res.status(500).json({ message: err.message || 'Internal server error' });
  }
}
