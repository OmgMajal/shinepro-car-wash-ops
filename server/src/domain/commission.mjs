import { AppError } from '../errors.mjs';

export function commissionAmount(baseToman, assignment) {
  const base = BigInt(baseToman);
  if (assignment.commission_type === 'fixed') return BigInt(assignment.fixed_amount_toman || 0);
  const points = BigInt(assignment.commission_percentage_basis_points || 0);
  return (base * points + 5000n) / 10000n;
}
export function calculateCommission(baseToman, assignments, maxPoolBasisPoints = null) {
  const base = BigInt(baseToman); const rows = assignments.map(a => ({ ...a, calculated_amount_toman: commissionAmount(base, a) }));
  const totalPoints = rows.reduce((sum, a) => sum + BigInt(a.commission_percentage_basis_points || 0), 0n);
  if (maxPoolBasisPoints !== null && totalPoints > BigInt(maxPoolBasisPoints)) throw new AppError('COMMISSION_LIMIT_EXCEEDED', 'The worker commission pool exceeds the configured limit.', 422);
  return { base_toman: base.toString(), total_toman: rows.reduce((sum, a) => sum + a.calculated_amount_toman, 0n).toString(), rows };
}
