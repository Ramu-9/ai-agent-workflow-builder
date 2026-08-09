import { Pool, PoolClient } from 'pg';

// Single connection pool for the entire functions server
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Get a client from the pool for transactional operations.
 * Always release the client in a finally block.
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Execute a single query against the pool (non-transactional).
 */
export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

/**
 * Execute a Hasura admin GraphQL query (bypasses permissions).
 */
export async function hasuraAdminQuery(
  queryStr: string,
  variables?: Record<string, any>
) {
  const fetch = (await import('node-fetch')).default;
  const url = process.env.HASURA_GRAPHQL_URL || 'http://graphql-engine:8080/v1/graphql';
  const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET || '';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret,
    },
    body: JSON.stringify({ query: queryStr, variables }),
  });

  const data = await response.json() as any;
  if (data.errors) {
    throw new Error(`Hasura query error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

export default pool;
