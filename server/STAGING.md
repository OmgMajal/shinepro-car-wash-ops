# CARWASH STAGING

This backend is intentionally isolated from production integrations.

- Environment: `staging`
- Payments: test mode only
- Notifications: disabled
- Database: separate PostgreSQL database required
- Storage: private object-storage adapter boundary; no public file URLs
- Reference UI: `_reference/browser-prototype-20260728`
- Backend snapshot: `_reference/backend-foundation-after-audit-20260728`

There is no usable Git repository metadata in the supplied workspace, so a Git branch/worktree could not be created safely. The isolated `server/` area plus preserved reference snapshots are the rollback boundary for this workspace.
