import { NhostClient } from '@nhost/nhost-js';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env') });

const nhost = new NhostClient({
  subdomain: 'local',
  graphqlUrl: 'http://localhost:8080/v1',
  authUrl: 'http://localhost:4000/v1',
});

const pool = new Pool({
  connectionString: 'postgres://postgres:postgres_secret_change_me@localhost:5432/postgres',
});

const ORG_A_ID = 'a0000000-0000-0000-0000-000000000001';
const ORG_B_ID = 'b0000000-0000-0000-0000-000000000002';

const USERS = [
  { email: 'alice@acme.com', password: 'password123', orgId: ORG_A_ID, role: 'owner' },
  { email: 'bob@acme.com', password: 'password123', orgId: ORG_A_ID, role: 'editor' },
  { email: 'charlie@acme.com', password: 'password123', orgId: ORG_A_ID, role: 'viewer' },
  { email: 'dave@globex.com', password: 'password123', orgId: ORG_B_ID, role: 'owner' },
  { email: 'eve@globex.com', password: 'password123', orgId: ORG_B_ID, role: 'editor' },
];

async function seed() {
  console.log('Starting seed process...');

  // 1. Run the SQL seed to create orgs and workflows
  const sqlPath = path.join(__dirname, '../nhost/seeds/001_demo_data.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Executed 001_demo_data.sql');

  // 2. Create users and link to orgs
  for (const u of USERS) {
    try {
      console.log(`Creating user ${u.email}...`);
      const { session, error } = await nhost.auth.signUp({
        email: u.email,
        password: u.password,
      });

      if (error) {
        if (error.message.includes('already exists')) {
          console.log(`User ${u.email} already exists, skipping.`);
          continue;
        }
        throw new Error(error.message);
      }

      // Wait a moment for Hasura to process the auth event
      await new Promise(r => setTimeout(r, 1000));

      // Get user ID
      const userRes = await pool.query('SELECT id FROM auth.users WHERE email = $1', [u.email]);
      const userId = userRes.rows[0].id;

      // Update metadata with default org context
      await pool.query(
        `UPDATE auth.users SET metadata = $1 WHERE id = $2`,
        [JSON.stringify({ org_id: u.orgId, org_role: u.role }), userId]
      );

      // Insert into org_members
      await pool.query(
        `INSERT INTO public.org_members (org_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [u.orgId, userId, u.role]
      );
      console.log(`Added ${u.email} to org ${u.orgId} as ${u.role}`);
    } catch (e) {
      console.error(`Failed to process user ${u.email}:`, e);
    }
  }

  // 3. Generate a webhook secret for the demo trigger
  const bcrypt = require('bcryptjs'); // Only need this via the functions container usually, but we can do it here for local seed
  const rawSecret = 'demo_webhook_secret_123';
  const hash = await bcrypt.hash(rawSecret, 10);
  
  await pool.query(
    `UPDATE public.workflow_triggers SET webhook_secret = $1 WHERE id = 't0000000-0000-0000-0000-000000000002'`,
    [hash]
  );
  console.log(`Updated demo webhook trigger with secret hash. Raw secret for testing: ${rawSecret}`);

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch(e => {
  console.error(e);
  process.exit(1);
});
