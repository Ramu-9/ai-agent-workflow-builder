export interface ApprovalGateConfig {
  message?: string;
  required_role?: string; // minimum role required to approve
}

/**
 * The approval gate step doesn't "execute" in the traditional sense.
 * It returns a signal that the executor should pause the workflow run.
 * 
 * The executor handles this by:
 * 1. Setting step_runs.status = 'waiting_approval'
 * 2. Setting workflow_runs.status = 'paused'
 * 3. RETURNING from the function (no held connection, no sleep)
 * 
 * Resume happens via a separate approveStep invocation.
 */
export function getApprovalGateInfo(config: ApprovalGateConfig): {
  requires_approval: true;
  message: string;
  required_role: string;
} {
  return {
    requires_approval: true,
    message: config.message || 'This step requires manual approval before continuing.',
    required_role: config.required_role || 'editor',
  };
}
