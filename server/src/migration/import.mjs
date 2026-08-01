import { preview, readSource, normalizePrototypeState } from './preview.mjs';
import { pool, withTransaction } from '../db/pool.mjs';
import { audit } from '../audit.mjs';

const sourceFile = process.argv[2] || process.env.MIGRATION_SOURCE || 'migration-source.json';
if (process.env.MIGRATION_ALLOW_WRITE !== 'true') throw new Error('Migration import is disabled. Set MIGRATION_ALLOW_WRITE=true only in staging after reviewing the preview.');
const report = preview(await readSource(sourceFile));
if (!report.valid) throw new Error(`Migration validation failed with ${report.errors.length} error(s). Run the preview and fix the source first.`);
const state = normalizePrototypeState(await readSource(sourceFile)); const businessId = process.env.MIGRATION_BUSINESS_ID; const branchId = process.env.MIGRATION_BRANCH_ID; const userId = process.env.MIGRATION_USER_ID || null;
if (!businessId || !branchId) throw new Error('MIGRATION_BUSINESS_ID and MIGRATION_BRANCH_ID are required.');
const result = await withTransaction(async client => {
  const batch = await client.query(`INSERT INTO migration_batches(source_label,status,imported_by,report) VALUES($1,'preview',$2,$3) RETURNING id`, [sourceFile, userId, report]);
  const batchId = batch.rows[0].id; const actor = { userId, roles: ['migration'], businessIds: [businessId], branchIds: [branchId] }; let imported = { customers: 0, jobs: 0, expenses: 0, inventory: 0 };
  for (const customer of state.customers) { await client.query(`INSERT INTO customers(business_id,name,phone,customer_type,legacy_source_id,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(business_id,legacy_source_id) DO NOTHING`, [businessId, customer.name || 'Imported customer', customer.phone || null, String(customer.type || 'walk_in').toLowerCase(), customer.id || null, userId]); imported.customers++; }
  for (const job of state.jobs) { const customer = state.customers.find(c => c.name === job.customer); const customerRow = customer?.id ? await client.query('SELECT id FROM customers WHERE business_id=$1 AND legacy_source_id=$2', [businessId, customer.id]) : { rowCount: 0 }; const safeStatus = ['waiting','assigned','in_progress','ready_for_quality','rework_required','ready_for_payment','completed','cancelled','refunded'].includes(String(job.status).toLowerCase().replaceAll(' ', '_')) ? String(job.status).toLowerCase().replaceAll(' ', '_') : 'waiting'; const inserted = await client.query(`INSERT INTO jobs(business_id,branch_id,customer_id,code,status,payment_status,original_price_toman,discount_toman,final_price_toman,notes,legacy_source_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) ON CONFLICT(business_id,legacy_source_id) DO NOTHING RETURNING id`, [businessId, branchId, customerRow.rows?.[0]?.id || null, job.code, safeStatus, String(job.paymentStatus || 'unpaid').toLowerCase(), Number(job.originalPrice || 0), Number(job.discount || 0), Number(job.finalPrice || 0), job.notes || null, job.id || null, userId]); if (inserted.rowCount) { await audit(client, { actor, businessId, branchId, action: 'migration.job_imported', entityType: 'job', entityId: inserted.rows[0].id, newValues: { sourceId: job.id, batchId }, requestId: `migration:${batchId}` }); imported.jobs++; } }
  await client.query(`UPDATE migration_batches SET status='imported',report=$1 WHERE id=$2`, [{ ...report, imported, batchId }, batchId]); return { batchId, imported, report };
});
console.log(JSON.stringify(result, null, 2)); await pool.end();
