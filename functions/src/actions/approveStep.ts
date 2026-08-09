import { Request, Response } from 'express';
import { extractSession, getUserId, verifyOrgMembership, getStepRunInfo, AuthError } from '../utils/auth';
import { executeWorkflow } from '../engine/executor';
import { query } from '../utils/db';

/**
 * Hasura Action handler: approveStep
 * 
 * Validation order (exactly as specified in the design):
 * 1. Extract x-hasura-user-id from session_variables
 * 2. Fetch step_run → verify exists, verify status = 'waiting_approval'
 * 3. Fetch org membership → verify user is member of step_run's org with role owner or editor
 * 4. Update step_run: status = 'completed', approved_by, approved_at
 * 5. Resume execution from the next step (fresh invocation reading persisted state)
 */
export async function approveStepHandler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const stepRunId = input.step_run_id;

    if (!stepRunId) {
      return res.status(400).json({ message: 'step_run_id is required' });
    }

    // Step 1: Extract user ID
    const session = session_variables || {};
    const userId = getUserId(session);

    // Step 2: Get step run info
    const stepInfo = await getStepRunInfo(stepRunId);

    // Verify step is in waiting_approval status
    if (stepInfo.status !== 'waiting_approval') {
      return res.status(400).json({
        message: `Step is not awaiting approval. Current status: ${stepInfo.status}`,
      });
    }

    // Step 3: Verify org membership with owner/editor role (Layer 2)
    // This prevents Org B users from approving Org A's steps even by guessing the ID
    await verifyOrgMembership(userId, stepInfo.orgId, ['owner', 'editor']);

    // Step 4: Update step_run to completed with approval info
    await query(
      `UPDATE public.step_runs
       SET status = 'completed', approved_by = $2, approved_at = now(), completed_at = now()
       WHERE id = $1`,
      [stepRunId, userId]
    );

    // Step 5: Get workflow info to resume execution
    const runResult = await query(
      `SELECT wr.workflow_id, wr.org_id, wr.trigger_type, wr.triggered_by
       FROM public.workflow_runs wr
       WHERE wr.id = $1`,
      [stepInfo.workflowRunId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ message: 'Workflow run not found' });
    }

    const run = runResult.rows[0];

    // Step 6: Resume execution from the next step
    // This is a FRESH invocation — not a held connection or setTimeout
    const result = await executeWorkflow({
      workflowId: run.workflow_id,
      orgId: run.org_id,
      triggerType: run.trigger_type,
      triggeredBy: run.triggered_by,
      workflowRunId: stepInfo.workflowRunId,
      startFromOrder: stepInfo.stepOrder,
    });

    return res.json({
      success: true,
      message: `Step approved by user ${userId}. ${result.message}`,
      workflow_run_id: stepInfo.workflowRunId,
      resumed_status: result.status,
    });

  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('approveStep error:', err);
    return res.status(500).json({ message: err.message || 'Internal server error' });
  }
}
