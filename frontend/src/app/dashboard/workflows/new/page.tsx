"use client";

import { useState } from 'react';
import { useMutation, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useOrg } from '../../../../context/OrgContext';
import Link from 'next/link';

const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($name: String!, $description: String!) {
    insert_workflows_one(object: {
      name: $name,
      description: $description,
      is_active: true
    }) {
      id
    }
  }
`;

export default function NewWorkflow() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createWorkflow, { loading, error }] = useMutation(CREATE_WORKFLOW);
  const router = useRouter();
  const { orgRole } = useOrg();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createWorkflow({ variables: { name, description } });
      // Redirect to the workflow page to add steps (in a real app)
      // For this assignment, we mostly rely on the seeded demo workflow
      alert('Workflow created! (Adding steps via UI is simplified for this demo)');
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
    }
  };

  if (orgRole !== 'owner' && orgRole !== 'editor') {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">You do not have permission to create workflows in this organization. Only owners and editors can do this.</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline mt-4 inline-block">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create New Workflow</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
        {error && (
          <div className="bg-red-50 text-red-500 p-3 rounded text-sm">
            {error.message}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Workflow Name
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="name"
              id="name"
              required
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <div className="mt-1">
            <textarea
              id="description"
              name="description"
              rows={3}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <Link
            href="/dashboard"
            className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Workflow'}
          </button>
        </div>
      </form>
    </div>
  );
}
