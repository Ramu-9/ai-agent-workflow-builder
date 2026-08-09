"use client";

import { useState, useEffect } from 'react';
import { useUserData } from '@nhost/nextjs';
import { useOrg } from '../context/OrgContext';
import { nhost } from '../lib/nhost';

interface Org {
  org_id: string;
  role: string;
  name: string;
  slug: string;
}

export function OrgSwitcher() {
  const user = useUserData();
  const { orgId, orgRole, refreshOrgData } = useOrg();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadOrgs();
    }
  }, [user]);

  const loadOrgs = async () => {
    try {
      const response = await fetch(nhost.graphql.httpUrl.replace('/v1/graphql', '/v1/functions/auth/my-orgs'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: user?.id }),
      });
      const data = await response.json();
      if (data.orgs) {
        setOrgs(data.orgs);
      }
    } catch (e) {
      console.error('Failed to load orgs', e);
    }
  };

  const switchOrg = async (targetOrgId: string) => {
    if (targetOrgId === orgId) return;
    setIsLoading(true);
    try {
      await fetch(nhost.graphql.httpUrl.replace('/v1/graphql', '/v1/functions/auth/switch-org'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: user?.id, org_id: targetOrgId }),
      });
      await refreshOrgData();
      // Reload the page to reset Apollo cache and components for the new org
      window.location.reload();
    } catch (e) {
      console.error('Failed to switch org', e);
      setIsLoading(false);
    }
  };

  if (!user || orgs.length === 0) return null;

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm font-medium text-gray-700">Org:</span>
      <select
        className="block w-48 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:opacity-50"
        value={orgId || ''}
        onChange={(e) => switchOrg(e.target.value)}
        disabled={isLoading}
      >
        <option value="" disabled>Select an organization</option>
        {orgs.map((org) => (
          <option key={org.org_id} value={org.org_id}>
            {org.name} ({org.role})
          </option>
        ))}
      </select>
    </div>
  );
}
