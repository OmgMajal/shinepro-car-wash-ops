# ShinePro production backend foundation

This is the staging backend foundation for the existing browser prototype.

## Selected architecture

The project uses a small Node.js HTTP API with PostgreSQL. PostgreSQL is the source of truth for identities, business/branch scope, jobs, payments, commissions, payroll, stock, approvals, audit events, and ledger entries. Private files are represented by database metadata and an object-storage adapter boundary; the staging configuration intentionally disables real notifications and payment integrations.

The browser prototype remains available and is backed up at `_reference/browser-prototype-20260728`. Backend adoption is incremental: authentication, customers, jobs, payments, finance, and inventory can move one module at a time. Once a module is migrated, the backend is authoritative for that module.

## Local staging setup

1. Copy `.env.example` to `.env` and set a private `PASSWORD_PEPPER` and `DATABASE_URL`.
2. Create a separate PostgreSQL database named `shinepro_staging`.
3. Run `npm install` and `npm run db:migrate`.
4. Start with `npm run server`.
5. Keep `APP_LABEL=CARWASH STAGING`, `PAYMENTS_MODE=test`, and `NOTIFICATIONS_MODE=disabled` until staging verification is complete.

The server exposes `/api/health`, `/api/auth/login`, `/api/auth/logout`, `/api/me`, business/branch-scoped customers/jobs, controlled job actions, and idempotent payment creation. The API intentionally does not expose a generic update endpoint. See `PRODUCTION_AUDIT.md`, `FINANCE.md`, and `src/migration/preview.mjs` for the audit, invariants, and migration flow.

## Production requirements before deployment

- Use a managed PostgreSQL instance with automated backups and a tested restore into staging.
- Replace the staging session cookie secret and database credentials with environment-specific secrets.
- Connect a private object-storage provider through the attachment adapter.
- Add a real email/SMS provider only in production configuration.
- Put the API behind TLS and a reverse proxy with rate limits.
- Run the authorization, migration, financial, and concurrency test suites in CI.
- Run `npm test` and `npm run migration:preview -- path/to/export.json` before any import. Imports require `MIGRATION_ALLOW_WRITE=true`, explicit business/branch/user IDs, and run transactionally with legacy source IDs for duplicate detection.
