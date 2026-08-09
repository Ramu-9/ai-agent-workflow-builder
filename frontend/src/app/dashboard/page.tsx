"use client";

import { useQuery, useMutation, gql } from '@apollo/client';
import { useOrg } from '../../context/OrgContext';
import Link from 'next/link';

const GET_WORKFLOWS = gql`
  query GetWorkflows {
    workflows(order_by: { updated_at: desc }) {
      id
      name
      description
      is_active
      updated_at
      workflow_runs_aggregate {
        aggregate {
          count
        }
      }
    }
  }
`;

const TRIGGER_WORKFLOW = gql`
  mutation TriggerWorkflow($workflowId: uuid!, $context: jsonb) {
    triggerWorkflowRun(input: { workflow_id: $workflowId, context: $context }) {
      workflowRunId
      status
      message
    }
  }
`;

export default function Dashboard() {
  const { orgId } = useOrg();
  const { data, loading, error } = useQuery(GET_WORKFLOWS, {
    skip: !orgId, // Don't fetch until org is loaded
  });

  const [triggerWorkflow, { loading: triggering, error: triggerError }] = useMutation(TRIGGER_WORKFLOW);

  if (!orgId) return <div className="text-center py-12 text-gray-500">Please select an organization.</div>;
  if (loading) return <div className="text-center py-12">Loading workflows...</div>;
  if (error) return <div className="text-center py-12 text-red-500">Error: {error.message}</div>;

  const handleTrigger = async (workflowId: string) => {
    try {
      const res = await triggerWorkflow({
        variables: { workflowId, context: { triggered_from: 'dashboard' } }
      });
      alert(`Workflow started! Run ID: ${res.data.triggerWorkflowRun.workflowRunId}`);
    } catch (e: any) {
      alert(`Error triggering workflow: ${e.message}`);
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage and run your AI agent workflows.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/dashboard/workflows/new"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Create Workflow
          </Link>
        </div>
      </div>

      {triggerError && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
          <p className="text-sm text-red-700">{triggerError.message}</p>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {data?.workflows.map((workflow: any) => (
            <li key={workflow.id}>
              <div className="px-4 py-4 flex items-center sm:px-6">
                <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between">
                  <div className="truncate">
                    <div className="flex text-sm">
                      <p className="font-medium text-blue-600 truncate">{workflow.name}</p>
                      <p className="ml-1 flex-shrink-0 font-normal text-gray-500">
                        {workflow.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ml-2">
                            Inactive
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="mt-2 flex">
                      <div className="flex items-center text-sm text-gray-500">
                        <p>{workflow.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex-shrink-0 sm:mt-0 sm:ml-5 flex space-x-3">
                    <span className="text-sm text-gray-500 flex items-center">
                      {workflow.workflow_runs_aggregate.aggregate.count} runs
                    </span>
                    <button
                      onClick={() => handleTrigger(workflow.id)}
                      disabled={triggering || !workflow.is_active}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:border-green-700 focus:shadow-outline-green active:bg-green-700 transition ease-in-out duration-150 disabled:opacity-50"
                    >
                      Run Now
                    </button>
                    <Link
                      href={`/dashboard/workflows/${workflow.id}`}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm leading-5 font-medium rounded-md text-gray-700 bg-white hover:text-gray-500 focus:outline-none focus:border-blue-300 focus:shadow-outline-blue active:text-gray-800 active:bg-gray-50 transition ease-in-out duration-150"
                    >
                      View Runs
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          ))}
          {data?.workflows.length === 0 && (
            <li className="px-4 py-8 text-center text-gray-500">
              No workflows found in this organization.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
