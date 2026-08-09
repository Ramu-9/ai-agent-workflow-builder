"use client";

import { NhostProvider } from '@nhost/nextjs';
import { ApolloProvider } from '@apollo/client';
import { nhost } from '../lib/nhost';
import { useApolloClient } from '../lib/apollo';
import { OrgProvider } from '../context/OrgContext';

export function Providers({ children }: { children: React.ReactNode }) {
  const apolloClient = useApolloClient();

  return (
    <NhostProvider nhost={nhost}>
      <OrgProvider>
        <ApolloProvider client={apolloClient}>
          {children}
        </ApolloProvider>
      </OrgProvider>
    </NhostProvider>
  );
}
