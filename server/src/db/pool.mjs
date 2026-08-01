import pg from 'pg';
import { config } from '../config.mjs';

const { Pool } = pg;
export const pool = new Pool({ connectionString: config.databaseUrl, max: 10, application_name: 'shinepro-staging-api' });

export async function withTransaction(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
