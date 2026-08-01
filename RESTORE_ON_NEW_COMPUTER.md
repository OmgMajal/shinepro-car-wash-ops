# Restore ShinePro on a New Windows Computer

## 1. Install prerequisites

Install Node.js 20 or newer, Git, and PostgreSQL if the connected staging backend is needed. Confirm the tools:

```powershell
node --version
npm --version
git --version
```

## 2. Clone the private repository

```powershell
git clone https://github.com/MajalDidIt/shinepro-car-wash-ops.git
Set-Location .\shinepro-car-wash-ops
```

The repository should remain private. If GitHub asks for authentication, use the account or credential manager configured for the owner; do not place a token in the clone URL.

## 3. Install and validate

```powershell
npm install
npm run check
npm test
```

The repository also includes `pnpm-lock.yaml`; with pnpm, use `pnpm install --frozen-lockfile` instead.

If only the visual demo is needed, open `landing.html` or `index.html` in Chrome. No database is required for that path.

## 4. Configure the local environment

Create a computer-local environment file. It is ignored by Git:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set a local PostgreSQL `DATABASE_URL`, a long random `PASSWORD_PEPPER`, and the correct local `PUBLIC_BUSINESS_ID`. Keep `PAYMENTS_MODE=test` and `NOTIFICATIONS_MODE=disabled` during staging. Never commit `.env`.

## 5. Start the connected staging app

Create the database and user according to the local PostgreSQL installation, then run:

```powershell
npm run db:migrate
npm run db:seed
npm run server
```

Open `http://localhost:8787/` in Chrome. The operational dashboard remains available at `http://localhost:8787/index.html`.

## 6. Continue development safely

Before committing:

```powershell
git status --short
git diff --check
npm run check
npm test
```

Confirm that `.env`, `node_modules`, `outputs`, local database files, and private keys are absent from the staged file list. Use `PROJECT_HANDOFF.md` and the server documentation as the source of truth for architecture and known limitations.
