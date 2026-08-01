# ShinePro Car-Wash Platform - Project Handoff

This document is the transfer record for the `shinepro-car-wash-ops` project. It is written so another developer can clone the private repository, restore the local environment, and continue work without needing the original computer.

Repository: [github.com/MajalDidIt/shinepro-car-wash-ops](https://github.com/MajalDidIt/shinepro-car-wash-ops) (private)

## Current scope

- Public experience: `landing.html`, `landing.css`, and `landing.js`.
- Customer portal preview: `customer.html`, `customer.css`, and `customer.js`.
- Business registration request page: `business-registration.html`, `business.css`, and `business-registration.js`.
- Internal operations dashboard: `index.html`, `styles.css`, `app.js`, `reporting.css`, and `reporting.js`.
- Production-oriented backend foundation: `server/` with PostgreSQL migrations, authentication/session helpers, permissions, public catalog/signup/registration routes, migration tooling, and tests.
- Premium report template builder: `reports/build-premium-template.mjs`.
- Deliberate sample workbook: `docs/examples/shinepro-premium-performance-template.xlsx`.

The app has both a browser-only demo path and a connected staging path. The browser-only demo persists state in local storage. The staging backend is designed to be used with PostgreSQL and must remain configured with test payments and disabled notifications until it has been independently validated.

## Transfer safety

The repository is configured to exclude:

- `.env` and all environment overrides except `.env.example`.
- `node_modules/` and other installed dependencies.
- Generated previews and report output under `outputs/`.
- Local database files, logs, build folders, and temporary files.
- `_reference/` audit snapshots.

No real credentials belong in this repository. Create a new `.env` locally from `.env.example` on each computer.

## Restore after cloning

From PowerShell:

```powershell
git clone https://github.com/MajalDidIt/shinepro-car-wash-ops.git
Set-Location .\shinepro-car-wash-ops
npm install
Copy-Item .env.example .env
npm run check
npm test
```

If using pnpm, the checked-in `pnpm-lock.yaml` is the reproducible install path:

```powershell
pnpm install --frozen-lockfile
```

For the browser-only demo, open `landing.html` or `index.html` directly. For the connected staging path, edit `.env` with local PostgreSQL values, then run:

```powershell
npm run db:migrate
npm run db:seed
npm run server
```

Open `http://localhost:8787/` in Chrome. Node.js 20 or newer is required. The backend uses the `pg` dependency declared in `package.json`.

## Key files and commands

| Purpose | Location or command |
| --- | --- |
| Public landing page | `landing.html` |
| Internal operations workspace | `index.html` |
| Server entrypoint | `server/src/http/server.mjs` |
| Database migrations | `server/sql/` |
| Security/backend notes | `server/PRODUCTION_AUDIT.md` |
| Staging instructions | `server/STAGING.md` |
| Syntax check | `npm run check` |
| Backend tests | `npm test` |
| Report builder | `reports/build-premium-template.mjs` |
| Sample Excel workbook | `docs/examples/shinepro-premium-performance-template.xlsx` |

The report builder uses the bundled spreadsheet runtime available in the original Codex environment. On a new computer, use a normal Node.js install and install the project's declared dependencies first; if the builder needs additional tooling, follow the runtime's documented setup rather than committing `node_modules`.

## Known limitations to address before production

- The front-end demo role switcher is not a security boundary; authorization must be enforced by the backend.
- A real PostgreSQL instance is required for migrations and connected API behavior.
- Payment providers, notifications, object storage, and production secrets are intentionally not configured here.
- Receipt verification references in the browser prototype are presentation-only until backed by an authoritative server endpoint.
- Scorecards label unavailable factors as insufficient data rather than inventing scores.
- Review `AUDIT.md`, `server/PRODUCTION_AUDIT.md`, and `server/FINANCE.md` before enabling production finance or customer data.

## Ownership and next handoff

The private GitHub repository should be created from the authenticated GitHub owner account and remain private. After pushing, record the final repository URL, commit SHA, branch, and ZIP backup location in the release notes or issue tracker. Never paste a live `.env`, password, token, database URL, or private key into GitHub issues, pull requests, or documentation.
