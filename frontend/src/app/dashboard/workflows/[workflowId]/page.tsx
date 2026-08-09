"use client";

import { useSubscription, useMutation, gql } from '@apollo/client';
import { useParams } from 'next/navigation';
import { useOrg } from '../../../../context/OrgContext';

const WORKFLOW_RUNS_SUB = gql`
  subscription GetWorkflowRuns($workflowId: uuid!) {
    workflow_runs(
      where: { workflow_id: { _eq: $workflowId } },
      order_by: { created_at: desc }
    ) {
      id
      status
      trigger_type
      started_at
      completed_at
      created_at
      step_runs(order_by: { step_order: asc }) {
        id
        step_order
        step_type
        status
        output
        error
        attempt_count
        started_at
        completed_at
      }
    }
  }
`;

const APPROVE_STEP = gql`
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(input: { step_run_id: $stepRunId }) {
      success
      message
      resumed_status
    }
  }
`;

export default function WorkflowRunsView() {
  const { workflowId } = useParams();
  const { orgId, orgRole } = useOrg();
  
  const { data, loading, error } = useSubscription(WORKFLOW_RUNS_SUB, {
    variables: { workflowId },
    skip: !orgId || !workflowId,
  });

  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);

  if (loading) return <div className="text-center py-12">Loading runs... (Waiting for WebSocket)</div>;
  if (error) return <div className="text-center py-12 text-red-500">Error: {error.message}</div>;

  const runs = data?.workflow_runs || [];

  const handleApprove = async (stepRunId: string) => {
    try {
      const res = await approveStep({ variables: { stepRunId } });
      alert(res.data.approveStep.message);
    } catch (e: any) {
      alert(`Approval failed: ${e.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800 animate-pulse';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'waiting_approval': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'skipped': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-8">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Workflow Runs</h1>
          <p className="mt-2 text-sm text-gray-700">
            Real-time execution status powered by GraphQL subscriptions.
          </p>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
          <p className="text-gray-500">No runs yet for this workflow.</p>
        </div>
      ) : (
        runs.map((run: any) => (
          <div key={run.id} className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
            <div className="px-4 py-5 sm:px-6 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Run ID: <span className="text-sm font-mono text-gray-500">{run.id}</span>
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  Trigger: {run.trigger_type} | Started: {new Date(run.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(run.status)}`}>
                  {run.status.toUpperCase()}
                </span>
              </div>
            </div>
            
            <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
              <ul className="divide-y divide-gray-200">
                {run.step_runs.map((step: any) => (
                  <li key={step.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm font-medium text-gray-900">
                            Step {step.step_order}: {step.step_type}
                          </span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(step.status)}`}>
                            {step.status}
                          </span>
                        </div>
                        
                        {step.error && (
                          <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                            Error: {step.error} (Attempt {step.attempt_count})
                          </div>
                        )}
                        
                        {step.status === 'waiting_approval' && (
                          <div className="mt-3">
                            <p className="text-sm text-gray-600 mb-2">
                              {step.output?.message || 'Requires manual approval.'}
                            </p>
                            {/* Layer 2 auth check happens on server, but we can hide the button if user is viewer */}
                            {(orgRole === 'owner' || orgRole === 'editor') ? (
                              <button
                                onClick={() => handleApprove(step.id)}
                                disabled={approving}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                              >
                                {approving ? 'Approving...' : 'Approve & Resume'}
                              </button>
                            ) : (
                              <p className="text-xs text-red-500 italic">You do not have permission to approve this step (requires Editor/Owner).</p>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {step.output && step.status !== 'waiting_approval' && (
                        <div className="ml-4 flex-shrink-0 w-1/3">
                          <details className="text-sm text-gray-500 cursor-pointer">
                            <summary className="font-medium text-blue-600 hover:text-blue-500">View Output</summary>
                            <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                              {JSON.stringify(step.output, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
                {run.step_runs.length === 0 && (
                  <li className="px-4 py-4 sm:px-6 text-sm text-gray-500">
                    Steps have not been initialized yet.
                  </li>
                )}
              </ul>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
