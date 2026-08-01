import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = (await fs.readdir(path.join(here, '../../sql'))).filter(x => x.endsWith('.sql')).sort();
await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
const client = await pool.connect();
for (const file of files) {
  const version = file.split('_')[0];
  const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
  if (existing.rowCount) continue;
  const sql = await fs.readFile(path.join(here, '../../sql', file), 'utf8');
  await client.query('BEGIN');
  try { await client.query(sql); await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]); await client.query('COMMIT'); console.log(`Applied ${file}`); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}
client.release();
await pool.end();
