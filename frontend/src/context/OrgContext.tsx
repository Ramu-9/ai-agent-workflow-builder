"use client";

import { createContext, useContext, useState, useEffect } from 'react';
import { useUserData, useAccessToken } from '@nhost/nextjs';
import { nhost } from '../lib/nhost';

interface OrgContextType {
  orgId: string | null;
  orgRole: string | null;
  refreshOrgData: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType>({
  orgId: null,
  orgRole: null,
  refreshOrgData: async () => {},
});

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const user = useUserData();
  const token = useAccessToken();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);

  const refreshOrgData = async () => {
    // Force a token refresh to get updated custom claims
    await nhost.auth.refreshSession();
  };

  useEffect(() => {
    if (token) {
      // Decode JWT to extract custom claims
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const claims = payload['https://hasura.io/jwt/claims'];
        if (claims) {
          setOrgId(claims['x-hasura-org-id'] || null);
          setOrgRole(claims['x-hasura-org-role'] || null);
        }
      } catch (e) {
        console.error('Error decoding JWT', e);
      }
    } else {
      setOrgId(null);
      setOrgRole(null);
    }
  }, [token]);

  return (
    <OrgContext.Provider value={{ orgId, orgRole, refreshOrgData }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
