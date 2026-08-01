# ShinePro Operations

Self-contained browser prototype for the ShinePro car-wash operations and worker commission workflow.

## Run

Open `index.html` in a browser. No build step or backend is required for the demo. State is persisted in browser local storage under `shinepro-ops-v1`.

For a syntax check:

```text
npm run check
```

## Staging backend

The production backend foundation lives under [`server/`](server/). Keep `APP_LABEL=CARWASH STAGING`, `PAYMENTS_MODE=test`, and `NOTIFICATIONS_MODE=disabled` while validating PostgreSQL migrations and API permissions. See [`server/STAGING.md`](server/STAGING.md), [`server/PRODUCTION_AUDIT.md`](server/PRODUCTION_AUDIT.md), and [`server/README.md`](server/README.md).

## Included in this first version

- Owner, manager, cashier, quality controller, worker, and accountant view switcher
- Live operational queue with filters, search, job detail drawer, and controlled workflow transitions
- Service/vehicle price snapshots, discount preservation, worker assignments, and commission breakdowns
- Quality gate before payment and commission earning
- Payment collection with overpayment protection and separate tips
- Cash register reconciliation formula and shift summary
- Expense capture with ledger/audit language
- Weekly worker earnings view with historical commission visibility
- Reports screen with CSV export
- Responsive mobile layout with compact cards and sticky detail actions
- Customer and vehicle management with a customer portal preview
- Inventory items, stock movements, minimum-level warnings, and supplier entry point
- Unified approval inbox with open, history, read, and action states
- Configuration center for services, commission, quality, approvals, finance, branches, roles, and notifications
- Draft editing, locked-record correction/refund requests, action menus, accessible labels, and Persian-ready RTL direction toggle

## Improvement audit

See [AUDIT.md](AUDIT.md) for the page-by-page gap review that drove the second pass.

## Product notes

This is a front-end demonstrator, not a production financial system. The role selector and action guards model the intended policy, but they are not a security boundary. A production release should move the state model behind authenticated APIs, enforce permissions, branch scope, and status transitions server-side, use integer minor monetary units or a decimal type, add durable double-entry ledger entries, and add automated tests for refunds, payroll carry-forward, branch isolation, customer privacy, and direct API authorization.
# ShinePro car-wash platform

## Public experience

The public-facing product now starts at `landing.html` when opened directly, or at `http://localhost:8787/` when the API server is running. It includes the premium landing page, customer-first signup/login modal, business registration request flow, and a separate noindex customer portal at `customer.html`. The existing operational application remains available at `index.html` and is linked as the internal workspace.

The generated hero asset is stored at `assets/hero-car.png`. Public services and offers are rendered from `/api/public/catalog` when the backend is available, with a clearly labeled demo fallback for direct `file://` preview.

## Local run

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `PASSWORD_PEPPER`, and `PUBLIC_BUSINESS_ID`.
3. Apply migrations with `npm run db:migrate`.
4. Start the connected site/API with `npm run server`.
5. Paste `http://localhost:8787/` into Chrome.

Public signup always creates a `customer` membership. Staff roles can only be assigned through the protected invitation endpoint and are never accepted from public signup input. `server/sql/003_public_experience.sql` adds public content, offers, memberships, loyalty, invitations, business-registration requests, testimonials, FAQ, notification preferences, and complaints.

## Reporting and receipts

The internal dashboard now has a Premium Export Center under `Export history`. It supports report-specific filters, English/RTL-ready language selection, score inclusion, raw-data inclusion, export history, transparent 0–100 scorecards, and multi-sheet Excel-compatible workbooks. Job actions open a dedicated receipt preview with A4/PDF browser printing, 80 mm thermal printing, masked customer contact data, payment status, service status, and verification reference.

The true `.xlsx` reference workbook is [shinepro-premium-performance-template.xlsx](docs/examples/shinepro-premium-performance-template.xlsx). Its workbook builder is `reports/build-premium-template.mjs` and uses the bundled spreadsheet runtime; rerun it with the workspace dependency Node executable after changing the sample template. Generated previews remain local under `outputs/` and are ignored by Git.

## Transfer and restore

The repository is transfer-ready for a private GitHub checkout. See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for the scope, exclusions, validation commands, and production caveats, and [RESTORE_ON_NEW_COMPUTER.md](RESTORE_ON_NEW_COMPUTER.md) for the Windows clone and restore procedure. The reusable sample workbook is kept at [docs/examples/shinepro-premium-performance-template.xlsx](docs/examples/shinepro-premium-performance-template.xlsx); generated previews and local environment overrides are intentionally excluded.
