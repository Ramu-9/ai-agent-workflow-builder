import { query } from './db';

/**
 * Session variables as forwarded by Hasura to action handlers.
 */
export interface SessionVariables {
  'x-hasura-user-id'?: string;
  'x-hasura-role'?: string;
  'x-hasura-org-id'?: string;
  'x-hasura-org-role'?: string;
}

/**
 * Extract session variables from the Hasura action request body.
 * Hasura forwards these from the verified JWT — they cannot be forged.
 */
export function extractSession(body: any): SessionVariables {
  return body.session_variables || {};
}

/**
 * Get the user ID from session variables. Throws if missing.
 */
export function getUserId(session: SessionVariables): string {
  const userId = session['x-hasura-user-id'];
  if (!userId) {
    throw new AuthError('Missing user ID in session', 401);
  }
  return userId;
}

/**
 * Verify that a user is a member of the specified org and has one of the required roles.
 * This is the Layer 2 (defense-in-depth) check — independent of Hasura permissions.
 * 
 * @returns The user's role in the org
 * @throws AuthError if user is not a member or doesn't have a required role
 */
export async function verifyOrgMembership(
  userId: string,
  orgId: string,
  requiredRoles: string[] = ['owner', 'editor']
): Promise<string> {
  const result = await query(
    'SELECT role FROM public.org_members WHERE user_id = $1 AND org_id = $2',
    [userId, orgId]
  );

  if (result.rows.length === 0) {
    throw new AuthError('Not a member of this organization', 403);
  }

  const role = result.rows[0].role;
  if (!requiredRoles.includes(role)) {
    throw new AuthError(
      `Role '${role}' is not authorized for this action. Required: ${requiredRoles.join(', ')}`,
      403
    );
  }

  return role;
}

/**
 * Get the org_id for a workflow by its ID.
 * @throws AuthError if workflow doesn't exist
 */
export async function getWorkflowOrgId(workflowId: string): Promise<string> {
  const result = await query(
    'SELECT org_id FROM public.workflows WHERE id = $1',
    [workflowId]
  );

  if (result.rows.length === 0) {
    throw new AuthError('Workflow not found', 404);
  }

  return result.rows[0].org_id;
}

/**
 * Get the org_id for a step_run by its ID.
 * @returns { orgId, status, workflowRunId, stepOrder }
 * @throws AuthError if step_run doesn't exist
 */
export async function getStepRunInfo(stepRunId: string) {
  const result = await query(
    `SELECT sr.org_id, sr.status, sr.workflow_run_id, sr.step_order, sr.step_type
     FROM public.step_runs sr WHERE sr.id = $1`,
    [stepRunId]
  );

  if (result.rows.length === 0) {
    throw new AuthError('Step run not found', 404);
  }

  return {
    orgId: result.rows[0].org_id as string,
    status: result.rows[0].status as string,
    workflowRunId: result.rows[0].workflow_run_id as string,
    stepOrder: result.rows[0].step_order as number,
    stepType: result.rows[0].step_type as string,
  };
}

/**
 * Custom error class for authorization errors.
 */
export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
