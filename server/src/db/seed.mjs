import { withTransaction, pool } from './pool.mjs';
import { makePasswordHash } from '../auth/sessions.mjs';

const email = process.env.SEED_OWNER_EMAIL || 'owner@shinepro.local'; const password = process.env.SEED_OWNER_PASSWORD || 'ChangeMe-Only-In-Staging-123!';
await withTransaction(async client => {
  const business = await client.query(`INSERT INTO businesses(name) VALUES('ShinePro Car Wash') ON CONFLICT DO NOTHING RETURNING id`); const businessId = business.rows[0]?.id || (await client.query(`SELECT id FROM businesses WHERE name='ShinePro Car Wash'`)).rows[0].id;
  const branch = await client.query(`INSERT INTO branches(business_id,name) VALUES($1,'Tehran · Vanak') ON CONFLICT(business_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [businessId]);
  const ownerRole = (await client.query(`SELECT id FROM roles WHERE key='business_owner'`)).rows[0].id;
  const user = await client.query(`INSERT INTO users(email,password_hash,display_name,status) VALUES($1,$2,'ShinePro Owner','active') ON CONFLICT(email) DO UPDATE SET status='active' RETURNING id`, [email, makePasswordHash(password)]);
  await client.query(`INSERT INTO business_memberships(business_id,user_id,role_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [businessId, user.rows[0].id, ownerRole]); await client.query(`INSERT INTO user_branch_assignments(user_id,branch_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [user.rows[0].id, branch.rows[0].id]);
});
console.log(`Seeded staging owner: ${email}`); console.log('Set SEED_OWNER_PASSWORD explicitly and change it before any shared environment.'); await pool.end();
