import { AppError } from '../errors.mjs';

export const ROLE_PERMISSIONS = {
  platform_super_admin: ['*'],
  business_owner: ['*'],
  company_administrator: ['jobs.view','jobs.create','customers.view','customers.manage','inventory.manage','settings.manage','audit.view'],
  branch_manager: ['jobs.view','jobs.create','jobs.transition','customers.view','customers.manage','payments.create','inventory.manage','audit.view'],
  accountant: ['jobs.view','customers.view','payments.create','payments.reverse','payroll.view','payroll.approve','audit.view'],
  cashier: ['jobs.view','jobs.create','customers.view','customers.manage','payments.create'],
  quality_controller: ['jobs.view','jobs.transition','audit.view'],
  team_leader: ['jobs.view','jobs.transition'],
  worker: ['jobs.view'],
  inventory_manager: ['jobs.view','inventory.manage'],
  customer: ['customers.view']
};

export function hasPermission(actor, permission) {
  return (actor?.roles || []).some(role => ROLE_PERMISSIONS[role]?.includes('*') || ROLE_PERMISSIONS[role]?.includes(permission));
}
export function requirePermission(actor, permission) {
  if (!actor) throw new AppError('AUTHENTICATION_REQUIRED', 'Sign in is required.', 401);
  if (!hasPermission(actor, permission)) throw new AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.', 403);
}
export function requireBusiness(actor, businessId) {
  if (!actor?.businessIds?.includes(businessId)) throw new AppError('BUSINESS_ACCESS_DENIED', 'This business is outside your access scope.', 403);
}
export function requireBranch(actor, branchId, businessId = null) {
  if (!actor) throw new AppError('AUTHENTICATION_REQUIRED', 'Sign in is required.', 401);
  if (businessId) requireBusiness(actor, businessId);
  const businessRoles = businessId ? (actor.rolesByBusiness?.[businessId] || []) : actor.roles || [];
  if (businessRoles.some(role => ['platform_super_admin','business_owner','company_administrator','accountant'].includes(role))) return;
  const allowedBranches = businessId ? (actor.branchScopes?.[businessId] || []) : (actor.branchIds || []);
  if (!allowedBranches.includes(branchId)) throw new AppError('BRANCH_ACCESS_DENIED', 'This branch is outside your assigned scope.', 403);
}
export function requireSelfOrPermission(actor, userId, permission) {
  if (actor?.userId !== userId) requirePermission(actor, permission);
}
export function preventSelfApproval(actor, requesterId) {
  if (actor?.userId === requesterId) throw new AppError('SELF_APPROVAL_DENIED', 'The requester cannot approve their own restricted action.', 403);
}
