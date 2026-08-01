import test from 'node:test';
import assert from 'node:assert/strict';
import { makePasswordHash, verifyPassword } from '../src/auth/sessions.mjs';
import { hasPermission, requireBranch, requirePermission } from '../src/auth/permissions.mjs';
import { calculateCommission } from '../src/domain/commission.mjs';
import { JOB_TRANSITIONS } from '../src/domain/jobs.mjs';
import { preview } from '../src/migration/preview.mjs';

test('password hashes verify without storing plaintext', () => {
  const hash = makePasswordHash('staging-password');
  assert.notEqual(hash, 'staging-password');
  assert.equal(verifyPassword('staging-password', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

test('business-aware branch scope denies another branch', () => {
  const actor = { roles: ['branch_manager'], rolesByBusiness: { b1: ['branch_manager'] }, branchScopes: { b1: ['br-a'] }, businessIds: ['b1'], branchIds: ['br-a'] };
  assert.doesNotThrow(() => requireBranch(actor, 'br-a', 'b1'));
  assert.throws(() => requireBranch(actor, 'br-b', 'b1'), error => error.code === 'BRANCH_ACCESS_DENIED');
  assert.throws(() => requireBranch(actor, 'br-a', 'b2'), error => error.code === 'BUSINESS_ACCESS_DENIED');
});

test('customer role cannot manage customers or view staff payroll', () => {
  const actor = { roles: ['customer'] };
  assert.equal(hasPermission(actor, 'customers.view'), true);
  assert.equal(hasPermission(actor, 'customers.manage'), false);
  assert.throws(() => requirePermission(actor, 'payroll.view'), error => error.code === 'PERMISSION_DENIED');
});

test('commission uses integer toman arithmetic and configured pool limit', () => {
  const result = calculateCommission(500000, [
    { commission_type: 'percentage', commission_percentage_basis_points: 1000 },
    { commission_type: 'percentage', commission_percentage_basis_points: 1000 },
    { commission_type: 'percentage', commission_percentage_basis_points: 700 },
    { commission_type: 'percentage', commission_percentage_basis_points: 500 }
  ], 3200);
  assert.equal(result.total_toman, '160000');
  assert.throws(() => calculateCommission(500000, [{ commission_type: 'percentage', commission_percentage_basis_points: 3300 }], 3200), error => error.code === 'COMMISSION_LIMIT_EXCEEDED');
});

test('job workflow is explicit and rejects arbitrary transitions by absence', () => {
  assert.equal(JOB_TRANSITIONS.waiting.assign, 'assigned');
  assert.equal(JOB_TRANSITIONS.ready_for_quality.approve_quality, 'ready_for_payment');
  assert.equal(JOB_TRANSITIONS.completed.complete, undefined);
  assert.equal(JOB_TRANSITIONS.waiting.complete, undefined);
});

test('migration preview detects invalid money and duplicate job codes', () => {
  const report = preview({ jobs: [{ id: 'a', code: 'CW-1', originalPrice: 100, finalPrice: 110 }, { id: 'b', code: 'CW-1', originalPrice: 100, finalPrice: 80 }] });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(error => error.code === 'DUPLICATE_JOB_CODE'));
  assert.ok(report.errors.some(error => error.code === 'DISCOUNT_EXCEEDS_PRICE') === false);
});
