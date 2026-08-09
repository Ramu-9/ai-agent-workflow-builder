import { query } from '../../utils/db';

export interface DbWriteConfig {
  result_key: string;
  description?: string;
}

/**
 * Write workflow results to the workflow_results table.
 * Stores the accumulated output from previous steps.
 */
export async function executeDbWrite(
  config: DbWriteConfig,
  previousOutput: any,
  context: {
    orgId: string;
    workflowRunId: string;
    stepRunId: string;
  }
): Promise<any> {
  const result = await query(
    `INSERT INTO public.workflow_results (org_id, workflow_run_id, step_run_id, result_key, result_value)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, result_key, created_at`,
    [
      context.orgId,
      context.workflowRunId,
      context.stepRunId,
      config.result_key,
      JSON.stringify(previousOutput || {}),
    ]
  );

  return {
    result_id: result.rows[0].id,
    result_key: result.rows[0].result_key,
    saved_at: result.rows[0].created_at,
    description: config.description || 'Result saved',
  };
}
