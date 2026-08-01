import { AppError } from '../errors.mjs';
import { requireBranch, requirePermission } from '../auth/permissions.mjs';
import { postLedgerTransaction } from './ledger.mjs';
import { audit } from '../audit.mjs';

function moneyInput(value, field) { if (value === undefined || value === null || !/^\d+$/.test(String(value))) throw new AppError('VALIDATION_ERROR', `${field} must be a non-negative integer toman value.`, 422); return BigInt(value); }

export async function createPayment(client, actor, input) {
  requirePermission(actor, 'payments.create');
  const jobResult = await client.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE', [input.jobId]); if (!jobResult.rowCount) throw new AppError('NOT_FOUND', 'Job was not found.', 404);
  const job = jobResult.rows[0]; requireBranch(actor, job.branch_id, job.business_id); const parts = Array.isArray(input.parts) ? input.parts : []; if (!parts.length) throw new AppError('VALIDATION_ERROR', 'At least one payment part is required.', 422); const amount = parts.reduce((s, p) => s + moneyInput(p.amountToman, 'Payment amount'), 0n); const tip = moneyInput(input.tipToman || 0, 'Tip amount');
  const existing = await client.query('SELECT * FROM payments WHERE business_id=$1 AND idempotency_key=$2', [job.business_id, input.idempotencyKey]);
  if (existing.rowCount) return { payment: existing.rows[0], duplicate: true };
  if (job.payment_status === 'paid') throw new AppError('DUPLICATE_REQUEST', 'This job already has a confirmed payment.', 409);
  if (amount < BigInt(job.final_price_toman)) throw new AppError('INSUFFICIENT_PAYMENT', 'Payment parts do not cover the amount due.', 422);
  if (amount > BigInt(job.final_price_toman)) throw new AppError('OVERPAYMENT_NOT_ALLOWED', 'Payment parts must equal the amount due; tips are recorded separately.', 422);
  for (const part of parts) if (!['cash','card','bank_transfer','customer_credit','membership_credit'].includes(part.method)) throw new AppError('INVALID_PAYMENT_METHOD', 'Payment method is not configured.', 422);
  const payment = await client.query('INSERT INTO payments(business_id,branch_id,job_id,created_by,status,total_amount_toman,tip_amount_toman,idempotency_key,confirmed_at) VALUES($1,$2,$3,$4,\'confirmed\',$5,$6,$7,now()) RETURNING *', [job.business_id, job.branch_id, job.id, actor.userId, job.final_price_toman, tip.toString(), input.idempotencyKey]);
  for (const part of parts) await client.query('INSERT INTO payment_parts(payment_id,method,amount_toman,reference) VALUES($1,$2,$3,$4)', [payment.rows[0].id, part.method, part.amountToman, part.reference || null]);
  await client.query('UPDATE jobs SET payment_status=\'paid\', version=version+1, updated_by=$1, updated_at=now() WHERE id=$2', [actor.userId, job.id]);
  const accountForMethod = { cash: 'cash_on_hand', card: 'card_receivable', bank_transfer: 'bank_receivable', customer_credit: 'customer_credit_receivable', membership_credit: 'membership_receivable' };
  const debitEntries = parts.map(part => ({ account_code: accountForMethod[part.method], debit_toman: part.amountToman }));
  await postLedgerTransaction(client, { actor, businessId: job.business_id, branchId: job.branch_id, eventType: 'customer_payment', sourceType: 'payment', sourceId: payment.rows[0].id, idempotencyKey: `payment:${payment.rows[0].id}`, entries: [...debitEntries, { account_code: 'service_revenue', credit_toman: job.final_price_toman }], requestId: input.requestId });
  await audit(client, { actor, businessId: job.business_id, branchId: job.branch_id, action: 'payment.confirmed', entityType: 'payment', entityId: payment.rows[0].id, newValues: { amount_toman: job.final_price_toman, tip_toman: tip.toString(), parts }, requestId: input.requestId });
  return { payment: payment.rows[0], duplicate: false };
}
