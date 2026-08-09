import { Request, Response } from 'express';
import { extractSession, getUserId, verifyOrgMembership, getWorkflowOrgId, AuthError } from '../utils/auth';
import { executeWorkflow, checkAndIncrementQuota } from '../engine/executor';

/**
 * Hasura Action handler: triggerWorkflowRun
 * 
 * Validation order (exactly as specified in the design):
 * 1. Extract x-hasura-user-id from session_variables
 * 2. Fetch workflow → verify it exists, get org_id
 * 3. Fetch membership → verify user is member of org_id with role owner or editor
 * 4. Quota check (atomic UPDATE...RETURNING)
 * 5. Execute workflow
 */
export async function triggerWorkflowRunHandler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const workflowId = input.workflow_id;

    if (!workflowId) {
      return res.status(400).json({ message: 'workflow_id is required' });
    }

    // Step 1: Extract user ID
    const session = session_variables || {};
    const userId = getUserId(session);

    // Step 2: Get workflow's org_id
    const orgId = await getWorkflowOrgId(workflowId);

    // Step 3: Verify membership with owner/editor role (Layer 2)
    await verifyOrgMembership(userId, orgId, ['owner', 'editor']);

    // Step 4: Atomic quota check
    const quotaOk = await checkAndIncrementQuota(orgId);
    if (!quotaOk) {
      return res.status(429).json({
        message: 'Organization quota exhausted. Please upgrade or wait for the next billing period.',
      });
    }

    // Step 5: Execute workflow
    const result = await executeWorkflow({
      workflowId,
      orgId,
      triggerType: 'manual',
      triggeredBy: userId,
      context: input.context || {},
    });

    return res.json(result);

  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('triggerWorkflowRun error:', err);
    return res.status(500).json({ message: err.message || 'Internal server error' });
  }
}
