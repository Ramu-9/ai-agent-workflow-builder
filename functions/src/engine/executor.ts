import { query, getClient } from '../utils/db';
import { executeLlmCall } from './steps/llmCall';
import { executeHttpRequest } from './steps/httpRequest';
import { executeDbWrite } from './steps/dbWrite';
import { executeNotify } from './steps/notify';
import { evaluateConditionalBranch } from './steps/conditionalBranch';
import { getApprovalGateInfo } from './steps/approvalGate';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Types
// ============================================================

interface WorkflowStep {
  id: string;
  step_order: number;
  step_type: string;
  config: any;
}

interface StepRun {
  id: string;
  step_order: number;
  step_type: string;
  status: string;
  output: any;
}

export interface ExecuteWorkflowParams {
  workflowId: string;
  orgId: string;
  triggerType: string;
  triggeredBy: string | null;
  context?: any;
  /** If set, resume from this step_order (exclusive — starts at startFromOrder + 1) */
  workflowRunId?: string;
  startFromOrder?: number;
}

// ============================================================
// Quota Check (atomic)
// ============================================================

/**
 * Atomically increment quota_used, returning true if successful.
 * Uses UPDATE...WHERE quota_used < quota_limit RETURNING id
 * — a single atomic operation, NOT a read-then-write.
 */
export async function checkAndIncrementQuota(orgId: string): Promise<boolean> {
  const result = await query(
    `UPDATE public.organizations
     SET quota_used = quota_used + 1
     WHERE id = $1 AND quota_used < quota_limit
     RETURNING id`,
    [orgId]
  );
  return result.rows.length > 0;
}

// ============================================================
// Main Execution Engine
// ============================================================

/**
 * Execute a workflow from start or resume from a specific step.
 * 
 * This function:
 * 1. Creates the workflow_run (if new) or updates it (if resuming)
 * 2. Creates step_runs for all pending steps (if new)
 * 3. Executes steps sequentially
 * 4. On approval_gate: persists state, sets status=paused, and RETURNS
 * 5. On failure after retries: persists error, sets status=failed
 * 6. On completion: sets status=completed
 * 
 * The function RETURNS after pausing — no held connection, no sleep.
 * Resume happens via a fresh call to this function with workflowRunId + startFromOrder.
 */
export async function executeWorkflow(params: ExecuteWorkflowParams): Promise<{
  workflowRunId: string;
  status: string;
  message: string;
}> {
  const { workflowId, orgId, triggerType, triggeredBy, context } = params;
  let { workflowRunId, startFromOrder } = params;

  // Fetch workflow steps
  const stepsResult = await query(
    'SELECT id, step_order, step_type, config FROM public.workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC',
    [workflowId]
  );
  const steps: WorkflowStep[] = stepsResult.rows;

  if (steps.length === 0) {
    throw new Error('Workflow has no steps');
  }

  // Create or resume workflow run
  const isResume = !!workflowRunId;

  if (!isResume) {
    // Create new workflow run
    const runResult = await query(
      `INSERT INTO public.workflow_runs (id, workflow_id, org_id, status, trigger_type, triggered_by, context, started_at)
       VALUES ($1, $2, $3, 'running', $4, $5, $6, now())
       RETURNING id`,
      [uuidv4(), workflowId, orgId, triggerType, triggeredBy, JSON.stringify(context || {})]
    );
    workflowRunId = runResult.rows[0].id;

    // Create step_runs for all steps
    for (const step of steps) {
      await query(
        `INSERT INTO public.step_runs (id, workflow_run_id, workflow_step_id, org_id, step_order, step_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [uuidv4(), workflowRunId, step.id, orgId, step.step_order, step.step_type]
      );
    }
  } else {
    // Resume: update workflow run status
    await query(
      `UPDATE public.workflow_runs SET status = 'running' WHERE id = $1`,
      [workflowRunId]
    );
  }

  // Determine which steps to execute
  const stepsToExecute = isResume && startFromOrder !== undefined
    ? steps.filter(s => s.step_order > startFromOrder!)
    : steps;

  // Get existing step outputs (for resume — need previous outputs)
  let previousOutput: any = null;
  if (isResume) {
    const prevRuns = await query(
      `SELECT output, step_order FROM public.step_runs
       WHERE workflow_run_id = $1 AND status = 'completed'
       ORDER BY step_order DESC LIMIT 1`,
      [workflowRunId]
    );
    if (prevRuns.rows.length > 0) {
      previousOutput = prevRuns.rows[0].output;
    }
  }

  // Track whether to skip the next step (for conditional_branch)
  let skipNext = false;

  // Execute steps sequentially
  for (const step of stepsToExecute) {
    // Get the step_run for this step
    const stepRunResult = await query(
      `SELECT id, status FROM public.step_runs
       WHERE workflow_run_id = $1 AND workflow_step_id = $2`,
      [workflowRunId, step.id]
    );

    if (stepRunResult.rows.length === 0) continue;
    const stepRunId = stepRunResult.rows[0].id;
    const currentStatus = stepRunResult.rows[0].status;

    // Skip if already completed (e.g., on resume)
    if (currentStatus === 'completed') {
      const completedOutput = await query(
        'SELECT output FROM public.step_runs WHERE id = $1', [stepRunId]
      );
      previousOutput = completedOutput.rows[0]?.output;
      continue;
    }

    // Handle skip from conditional_branch
    if (skipNext) {
      await query(
        `UPDATE public.step_runs SET status = 'skipped', started_at = now(), completed_at = now()
         WHERE id = $1`,
        [stepRunId]
      );
      skipNext = false;
      continue;
    }

    // Mark step as running
    await query(
      `UPDATE public.step_runs SET status = 'running', started_at = now(), attempt_count = attempt_count + 1
       WHERE id = $1`,
      [stepRunId]
    );

    try {
      let output: any;

      switch (step.step_type) {
        case 'llm_call':
          output = await executeWithRetry(
            () => executeLlmCall(step.config, previousOutput),
            stepRunId,
            step.config.max_attempts || 3
          );
          break;

        case 'http_request':
          output = await executeWithRetry(
            () => executeHttpRequest(step.config, previousOutput),
            stepRunId,
            step.config.max_attempts || 3
          );
          break;

        case 'db_write':
          output = await executeDbWrite(step.config, previousOutput, {
            orgId,
            workflowRunId: workflowRunId!,
            stepRunId,
          });
          break;

        case 'notify':
          output = await executeNotify(step.config, previousOutput, {
            orgId,
            workflowRunId: workflowRunId!,
            stepRunId,
          });
          break;

        case 'conditional_branch': {
          const branchResult = evaluateConditionalBranch(step.config, previousOutput);
          output = branchResult;
          if (!branchResult.branch_taken) {
            skipNext = true;
          }
          break;
        }

        case 'approval_gate': {
          const gateInfo = getApprovalGateInfo(step.config);
          // Set step to waiting_approval
          await query(
            `UPDATE public.step_runs
             SET status = 'waiting_approval', output = $2
             WHERE id = $1`,
            [stepRunId, JSON.stringify(gateInfo)]
          );
          // Set workflow run to paused
          await query(
            `UPDATE public.workflow_runs SET status = 'paused' WHERE id = $1`,
            [workflowRunId]
          );
          // RETURN — no held connection, no sleep
          // Resume will happen via a fresh approveStep call
          return {
            workflowRunId: workflowRunId!,
            status: 'paused',
            message: gateInfo.message,
          };
        }

        default:
          throw new Error(`Unknown step type: ${step.step_type}`);
      }

      // Mark step as completed
      await query(
        `UPDATE public.step_runs
         SET status = 'completed', output = $2, completed_at = now()
         WHERE id = $1`,
        [stepRunId, JSON.stringify(output)]
      );
      previousOutput = output;

    } catch (err: any) {
      // Step failed after all retries
      await query(
        `UPDATE public.step_runs
         SET status = 'failed', error = $2, completed_at = now()
         WHERE id = $1`,
        [stepRunId, err.message || 'Unknown error']
      );
      // Mark workflow run as failed
      await query(
        `UPDATE public.workflow_runs SET status = 'failed', completed_at = now() WHERE id = $1`,
        [workflowRunId]
      );
      return {
        workflowRunId: workflowRunId!,
        status: 'failed',
        message: `Step ${step.step_order} (${step.step_type}) failed: ${err.message}`,
      };
    }
  }

  // All steps completed
  await query(
    `UPDATE public.workflow_runs SET status = 'completed', completed_at = now() WHERE id = $1`,
    [workflowRunId]
  );

  return {
    workflowRunId: workflowRunId!,
    status: 'completed',
    message: 'Workflow completed successfully',
  };
}

// ============================================================
// Retry Logic
// ============================================================

/**
 * Execute a function with retry logic.
 * - Max attempts: configurable (default 3)
 * - Backoff: exponential (1s, 2s, 4s)
 * - Only llm_call and http_request are retried; others fail immediately
 * - attempt_count is persisted to step_runs on each retry
 */
async function executeWithRetry(
  fn: () => Promise<any>,
  stepRunId: string,
  maxAttempts: number = 3
): Promise<any> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Persist the attempt count
      await query(
        `UPDATE public.step_runs SET attempt_count = $2, error = $3 WHERE id = $1`,
        [stepRunId, attempt, err.message || 'Unknown error']
      );

      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await sleep(backoffMs);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
