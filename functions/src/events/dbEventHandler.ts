import { Request, Response } from 'express';
import { query } from '../utils/db';
import { executeWorkflow, checkAndIncrementQuota } from '../engine/executor';

/**
 * Hasura Event Trigger handler: fires when a new row is inserted
 * into workflow_results. Checks for db_event triggers that watch
 * for this event and executes their workflows.
 * 
 * Called by Hasura Event Trigger with admin secret — no user JWT.
 */
export async function dbEventHandler(req: Request, res: Response) {
  try {
    const event = req.body.event;
    const table = req.body.table;

    if (!event || !event.data || !event.data.new) {
      return res.json({ message: 'No event data' });
    }

    const newRow = event.data.new;
    const orgId = newRow.org_id;

    if (!orgId) {
      return res.json({ message: 'No org_id in event data' });
    }

    // Find active db_event triggers for this org
    const result = await query(
      `SELECT wt.id, wt.workflow_id, wt.config, w.org_id
       FROM public.workflow_triggers wt
       JOIN public.workflows w ON w.id = wt.workflow_id
       WHERE wt.trigger_type = 'db_event'
         AND wt.is_active = true
         AND w.is_active = true
         AND w.org_id = $1`,
      [orgId]
    );

    const triggered: string[] = [];

    for (const trigger of result.rows) {
      try {
        const quotaOk = await checkAndIncrementQuota(trigger.org_id);
        if (!quotaOk) continue;

        const execResult = await executeWorkflow({
          workflowId: trigger.workflow_id,
          orgId: trigger.org_id,
          triggerType: 'db_event',
          triggeredBy: null,
          context: {
            event_trigger_id: trigger.id,
            event_table: table?.name,
            event_data: newRow,
          },
        });

        triggered.push(`${trigger.id}: ${execResult.status}`);
      } catch (err: any) {
        console.error(`db_event trigger ${trigger.id} failed:`, err);
      }
    }

    return res.json({ triggered_count: triggered.length, triggered });

  } catch (err: any) {
    console.error('dbEventHandler error:', err);
    return res.status(500).json({ message: err.message || 'Internal server error' });
  }
}
