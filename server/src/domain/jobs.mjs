import { AppError } from '../errors.mjs';
import { audit } from '../audit.mjs';
import { requireBranch, requirePermission } from '../auth/permissions.mjs';

export const JOB_TRANSITIONS = {
  waiting: { assign: 'assigned', cancel: 'cancelled' },
  assigned: { start: 'in_progress', cancel: 'cancelled' },
  in_progress: { submit_for_quality: 'ready_for_quality', pause: 'paused', cancel: 'cancelled' },
  paused: { resume: 'in_progress', cancel: 'cancelled' },
  ready_for_quality: { request_rework: 'rework_required', approve_quality: 'ready_for_payment' },
  rework_required: { start: 'in_progress', cancel: 'cancelled' },
  ready_for_payment: { complete: 'completed' },
  completed: {}, cancelled: {}, refunded: {}
};

export async function transitionJob(client, actor, { jobId, action, expectedVersion, requestId }) {
  requirePermission(actor, 'jobs.transition');
  const result = await client.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE', [jobId]);
  if (!result.rowCount) throw new AppError('NOT_FOUND', 'Job was not found.', 404);
  const job = result.rows[0]; requireBranch(actor, job.branch_id, job.business_id);
  if (expectedVersion !== undefined && Number(expectedVersion) !== job.version) throw new AppError('CONCURRENT_UPDATE', 'This job changed after you opened it. Review the latest version before saving.', 409);
  const next = JOB_TRANSITIONS[job.status]?.[action];
  if (!next) throw new AppError('INVALID_STATUS_TRANSITION', `Action ${action} is not allowed from ${job.status}.`, 422);
  if (action === 'complete' && job.payment_status !== 'paid') throw new AppError('PAYMENT_REQUIRED', 'A job cannot be completed before payment or approved credit is recorded.', 422);
  if (action === 'approve_quality') {
    const participant = await client.query(`SELECT 1 FROM worker_assignments wa JOIN workers w ON w.id=wa.worker_id WHERE wa.job_id=$1 AND w.user_id=$2 LIMIT 1`, [job.id, actor.userId]);
    if (participant.rowCount) throw new AppError('SELF_APPROVAL_DENIED', 'A worker who participated in this job cannot approve its quality.', 403);
  }
  const update = await client.query('UPDATE jobs SET status=$1, version=version+1, updated_by=$2, updated_at=now(), completed_at=CASE WHEN $1=\'completed\' THEN now() ELSE completed_at END WHERE id=$3 AND version=$4 RETURNING *', [next, actor.userId, jobId, job.version]);
  if (!update.rowCount) throw new AppError('CONCURRENT_UPDATE', 'This job changed after you opened it. Review the latest version before saving.', 409);
  await audit(client, { actor, businessId: job.business_id, branchId: job.branch_id, action: `job.${action}`, entityType: 'job', entityId: job.id, previousValues: { status: job.status, version: job.version }, newValues: { status: next, version: job.version + 1 }, requestId });
  return update.rows[0];
}
