import fs from 'node:fs/promises';
import path from 'node:path';

export function normalizePrototypeState(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  return {
    source: 'shinepro-browser-prototype',
    customers: Array.isArray(state.customers) ? state.customers : [],
    vehicles: Array.isArray(state.vehicles) ? state.vehicles : [],
    jobs: Array.isArray(state.jobs) ? state.jobs : [],
    workers: Array.isArray(state.workers) ? state.workers : [],
    expenses: Array.isArray(state.expenses) ? state.expenses : [],
    inventory: Array.isArray(state.inventory) ? state.inventory : []
  };
}

const duplicateValues = (items, key) => {
  const seen = new Map(); const duplicates = [];
  for (const item of items) { const value = item?.[key]; if (!value) continue; if (seen.has(value)) duplicates.push({ value, first: seen.get(value), duplicate: item.id || item.code }); else seen.set(value, item.id || item.code); }
  return duplicates;
};

export function preview(raw) {
  const state = normalizePrototypeState(raw); const errors = []; const warnings = [];
  if (!state.customers.length) warnings.push('No customer records were found.');
  if (!state.jobs.length) warnings.push('No job records were found.');
  for (const job of state.jobs) {
    if (!job.code) errors.push({ entity: 'job', id: job.id, code: 'MISSING_JOB_CODE', message: 'Job code is required.' });
    if (!Number.isInteger(Number(job.finalPrice)) || Number(job.finalPrice) < 0) errors.push({ entity: 'job', id: job.id, code: 'INVALID_MONEY', message: 'Final price must be a non-negative integer toman value.' });
    if (Number(job.discount || 0) > Number(job.originalPrice || 0)) errors.push({ entity: 'job', id: job.id, code: 'DISCOUNT_EXCEEDS_PRICE', message: 'Discount cannot exceed original price.' });
  }
  for (const duplicate of duplicateValues(state.jobs, 'code')) errors.push({ entity: 'job', code: 'DUPLICATE_JOB_CODE', ...duplicate });
  for (const duplicate of duplicateValues(state.customers, 'phone')) warnings.push({ entity: 'customer', code: 'DUPLICATE_CUSTOMER_PHONE', ...duplicate });
  for (const duplicate of duplicateValues(state.inventory, 'name')) warnings.push({ entity: 'inventory', code: 'DUPLICATE_INVENTORY_NAME', ...duplicate });
  return { valid: errors.length === 0, source: state.source, counts: Object.fromEntries(Object.entries(state).filter(([key]) => Array.isArray(state[key])).map(([key, value]) => [key, value.length])), errors, warnings, importMode: 'transactional-and-idempotent' };
}

export async function readSource(file = process.env.MIGRATION_SOURCE || path.resolve('migration-source.json')) {
  const text = await fs.readFile(file, 'utf8'); return JSON.parse(text);
}

if (process.argv[1]?.endsWith('preview.mjs')) {
  const file = process.argv[2] || process.env.MIGRATION_SOURCE || 'migration-source.json';
  try { const report = preview(await readSource(file)); console.log(JSON.stringify({ file, ...report }, null, 2)); process.exitCode = report.valid ? 0 : 2; }
  catch (error) { console.error(JSON.stringify({ valid: false, error: 'MIGRATION_SOURCE_UNREADABLE', message: error.message }, null, 2)); process.exitCode = 2; }
}
