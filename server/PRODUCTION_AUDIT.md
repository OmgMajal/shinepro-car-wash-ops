# Production backend audit

Audit date: 2026-07-28
Environment: `CARWASH STAGING`

## Current architecture

- Browser prototype: `index.html`, `styles.css`, `app.js`; authoritative state is still browser `localStorage`.
- Backend foundation: Node.js ESM HTTP API with PostgreSQL, opaque database-backed sessions, domain services, audit events, ledger posting, and staging-only payment/notification flags.
- Reference copy: `_reference/browser-prototype-20260728` is preserved for rollback and comparison.
- Git branch/worktree: no usable Git metadata is available in this workspace, so the implementation is isolated under `server/` and the reference copy remains untouched.

## Findings

| Area | Finding | Risk | Action |
|---|---|---:|---|
| Browser-only data | Frontend still uses localStorage for the demo state | High | Keep as fallback until module migration; add preview/validation adapter |
| Authentication | Opaque, hashed database sessions and scrypt password hashes exist | Medium | Add rate-limit/account lock fields and production configuration checks |
| Authorization | Role permissions exist, but actor scope was not consistently tied to business + branch | Critical | Add business-aware branch scopes and enforce them in job/payment/customer queries |
| Customer privacy | Customer list was business-wide and had no customer ownership filter | Critical | Restrict customer role to its linked profile and related records |
| Worker privacy | Job list could expose all branch jobs to workers | High | Restrict worker job queries to assigned jobs |
| Job workflow | Controlled transition map exists | Medium | Enforce quality self-approval restriction and business-aware branch scope |
| Payment idempotency | Unique idempotency key exists, but paid-job check ran before duplicate lookup | High | Return the original payment for a safe retry before rejecting new payments |
| Ledger | Payment ledger used one generic cash/bank account | High | Classify ledger entries by payment part and never classify credit as collected cash |
| Financial precision | Domain commission and payment paths use bigint toman values | Low | Document rounding and add pure financial tests |
| Database | Core tables and indexes exist; payroll period was declared twice | Medium | Add security/constraint migration and remove duplicate declaration |
| Role setup | Roles and permissions were seeded but role_permissions links were not | Critical | Seed explicit role-permission mappings |
| Migration | Package script referenced a missing migration preview module | High | Add preview, duplicate detection, validation, and guarded import adapter |
| Tests | No server test directory was present | High | Add permission, commission, transition, migration, and ledger tests |
| Files | Attachment metadata table exists, object-storage adapter does not | Medium | Keep private storage boundary documented; do not expose public URLs |
| Observability | Structured app errors exist, but request/security logging is minimal | Medium | Add safe request logging and health metadata without secrets |

## Production boundary

This pass creates a deployable backend foundation and testable domain boundaries. It does not connect a real payment processor, notification provider, object-storage bucket, or production database. Those integrations require environment-specific credentials, a verified backup/restore, TLS, rate limiting, and an operational review.
