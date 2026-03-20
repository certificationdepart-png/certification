## Vercel Deployment Template (Client)

This checklist is optimized for “set env vars, deploy” (migrations + seed run automatically during Vercel build).

### One-click Deploy Button
[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fthedev-company%2Fgoogle-sheets-automatization.git&env=DIRECT_DATABASE_URL,DATABASE_URL,CRON_SECRET,AUTH_SECRET,DATA_ENCRYPTION_KEY,GOOGLE_SERVICE_ACCOUNT_JSON)
The URL only requests which env var keys are needed; secret values are entered in the Vercel form (not in the link).

### 1) Create a Vercel project
Import this repo (GitHub) and create a new Vercel project for it.

### 2) Build settings
In Vercel settings, ensure:
- Install command: `bun install --frozen-lockfile`
- Build command: `bun run build`

(`vercel.json` already includes these defaults.)

Vercel can install Bun automatically when a Bun lockfile is present in the repo (this project uses `bun.lock`).

### 3) Set Environment Variables
Copy values from this repo’s `.env.example` into the Vercel Project Environment Variables.

Required for Stage 1 runtime (login + cron):
- `DIRECT_DATABASE_URL` (optional; Prisma migrations + seed prefer it)
- `DATABASE_URL` (transaction pooler runtime)
- `CRON_SECRET` (required for cron auth in production)
- `AUTH_SECRET` (>= 32 chars)
- `DATA_ENCRYPTION_KEY` (>= 32 chars)
- `GOOGLE_SERVICE_ACCOUNT_JSON` (service account JSON for Google Sheets)

### 4) Deploy
Deploy the project in Vercel.

During the Vercel build, this project will run:
- `bun prisma generate`
- `bun db:migrate:deploy`
- `bun db:seed`

These are safe to run repeatedly (migrations apply only pending changes; seed uses `upsert`).

### 5) Smoke tests
After deployment:
- `GET /api/health` should return `ok: true` (or `status: healthy/degraded`)
- Confirm cron endpoint auth behavior:
  - Vercel calls `GET /api/cron/process-sync-jobs` with `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set in the Vercel environment.

On Vercel Hobby plans, this project runs cron once/day with schedule `0 3 * * *` (UTC by Vercel).

Example curl (replace with real values):
```bash
curl -sS https://YOUR-DOMAIN/api/cron/process-sync-jobs \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

