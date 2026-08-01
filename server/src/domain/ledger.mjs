import { AppError } from '../errors.mjs';
import { audit } from '../audit.mjs';

export async function postLedgerTransaction(client, { actor, businessId, branchId, eventType, sourceType, sourceId, idempotencyKey, entries, requestId }) {
  const totalDebit = entries.reduce((s, x) => s + BigInt(x.debit_toman || 0), 0n); const totalCredit = entries.reduce((s, x) => s + BigInt(x.credit_toman || 0), 0n);
  if (totalDebit !== totalCredit) throw new AppError('LEDGER_UNBALANCED', 'Financial transaction is incomplete and was not posted.', 422, { totalDebit: totalDebit.toString(), totalCredit: totalCredit.toString() });
  const existing = await client.query('SELECT id FROM ledger_transactions WHERE idempotency_key=$1', [idempotencyKey]); if (existing.rowCount) return { id: existing.rows[0].id, duplicate: true };
  const tx = await client.query('INSERT INTO ledger_transactions(business_id,branch_id,event_type,source_type,source_id,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [businessId, branchId, eventType, sourceType, sourceId, idempotencyKey, actor?.userId || null]);
  for (const entry of entries) await client.query('INSERT INTO ledger_entries(transaction_id,account_code,debit_toman,credit_toman) VALUES($1,$2,$3,$4)', [tx.rows[0].id, entry.account_code, entry.debit_toman || 0, entry.credit_toman || 0]);
  await audit(client, { actor, businessId, branchId, action: `ledger.${eventType}`, entityType: sourceType, entityId: sourceId, newValues: { transactionId: tx.rows[0].id, entries }, requestId });
  return { id: tx.rows[0].id, duplicate: false };
}
