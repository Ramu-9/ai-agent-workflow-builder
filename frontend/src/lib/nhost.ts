import { NhostClient } from '@nhost/nextjs';

// Setup the Nhost client.
// NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are used for Nhost Cloud.
// If missing, it defaults to localhost endpoints for local development.

export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local',
  region: process.env.NEXT_PUBLIC_NHOST_REGION,
  graphqlUrl: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
    ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
    : 'http://localhost:8080/v1',
  authUrl: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN
    ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.auth.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
    : 'http://localhost:4000/v1',
  storageUrl: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN
    ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.storage.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
    : 'http://localhost:5000/v1',
  functionsUrl: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN
    ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.functions.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
    : 'http://localhost:3000/v1'
});
