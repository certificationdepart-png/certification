# Google Sheets Automatization Platform (Next.js Stage 1 Foundation)

Stage 1 implementation of the multi-school platform foundation from
`docs/implementation-roadmap-nextjs.md`.

## Tech stack

- Next.js 16 (App Router)
- Bun
- TypeScript
- Tailwind CSS v4 + shadcn/ui
- Prisma 7 + PostgreSQL (Supabase-compatible)
- better-auth (email/password)
- Vercel deployment baseline

## One-command local bootstrap

After you configure `.env` (see below), run:

```bash
bun install && bun db:migrate && bun db:seed && bun dev
```

## Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required for Stage 1:

- `DATABASE_URL`: Postgres/Supabase connection string
- `AUTH_SECRET`: long random secret (>=32 chars)
- `BETTER_AUTH_URL`: app URL (for local: `http://localhost:3000`)
- `NEXT_PUBLIC_APP_URL`: public app URL (for local: `http://localhost:3000`)
- `NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL`: optional HTTPS base used in the school admin “Telegram webhook” hint (set to your **ngrok** URL when testing bots locally; free tunnels use **`*.ngrok-free.app`**, copy it exactly from ngrok’s **Forwarding** line). Telegram cannot call `localhost`; without a tunnel, updates never reach `/api/telegram/webhook`.

Reserved for next stages:

- `TELEGRAM_BOT_TOKEN`
- `NOVA_POSHTA_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (Google service account JSON; set it so it parses as real JSON)

For `.env` safety, prefer setting `GOOGLE_SERVICE_ACCOUNT_JSON_B64` to the base64-encoded service account JSON (avoids quoting/newline issues). If you use `GOOGLE_SERVICE_ACCOUNT_JSON` directly, wrap it so the entire JSON remains valid (dotenv can break when the value is double-quoted but contains embedded quotes).

## Database and Prisma

- Prisma schema: `prisma/schema.prisma`
- Prisma config: `prisma.config.ts`
- Seed script: `prisma/seed.ts`

Useful commands:

- `bun db:migrate`
- `bun db:migrate:deploy`
- `bun db:reset`
- `bun db:seed`
- `bun prisma:validate`

### Якщо в БД немає кроку `q4_add_more_courses` (SessionStep)

1. Переконайся, що **`DATABASE_URL`** у `.env` — та сама база, куди дивишся в GUI (dev / staging / prod).
2. Застосуй міграції: `bun db:migrate:deploy` (або `bun db:migrate` локально).
3. Перевір enum у Postgres (у `public`):

   ```sql
   SELECT e.enumlabel
   FROM pg_catalog.pg_enum e
   JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'SessionStep'
   ORDER BY e.enumsortorder;
   ```

   У списку має бути **`q4_add_more_courses`**.

4. Міграція `20260321100000_sessionstep_q4_enum_idempotent` **ідемпотентна**: повторний deploy не зламає вже оновлену БД.
5. **PostgreSQL &lt; 12:** `ALTER TYPE … ADD VALUE` у транзакції міграції може завершитись помилкою. Тоді виконай вручну в автокоміті (окрема сесія `psql` без обгортки транзакції):

   ```sql
   ALTER TYPE "SessionStep" ADD VALUE 'q4_add_more_courses';
   ```

6. Після змін у enum: `bun prisma generate` і перезапуск `bun dev`.

## Authentication and routes

- Auth API: `src/app/api/auth/[...all]/route.ts`
- Login page: `/login`
- Protected admin layout: `src/app/(admin)/layout.tsx`
- Initial protected page: `/dashboard`

Default seeded login (after `bun db:seed`):

- Email: `admin@example.com`
- Password: `changeme123`

## Observability baseline

- Structured logger: `src/lib/logger.ts`
- Error tracking hook stub: `src/lib/error-tracking.ts`
- Health endpoint: `GET /api/health`
- Metrics stub endpoint: `GET /api/metrics`

## CI

CI workflow is defined in `.github/workflows/ci.yml` and runs:

- Lint (`bun lint`)
- Typecheck (`bun typecheck`)
- Tests (`bun test`)
- Prisma validation (`bun prisma:validate`)

## Vercel deployment baseline

`vercel.json` includes Next.js build baseline. In Vercel, set the same env variables from `.env.example` for the target environment.

For Supabase, use the Postgres connection string in `DATABASE_URL` (SSL parameters as required by your Supabase project).

## One-click Vercel Deploy Button (client)
Use this Deploy Button link to have Vercel create a new project from your repo and prompt for the required environment variables.
The URL only requests which env var keys are needed; secret values are entered in the Vercel form (not in the link).

[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fthedev-company%2Fgoogle-sheets-automatization.git&env=DATABASE_URL,AUTH_SECRET,DATA_ENCRYPTION_KEY,BETTER_AUTH_URL,NEXT_PUBLIC_APP_URL,CRON_SECRET)

## Vercel deployment checklist (client)
This project runs Prisma migrations + the demo seed automatically during Vercel builds (idempotent via `migrate deploy` + `upsert` seed).

Copy/paste version: `docs/vercel-client-deployment-template.md`.

1. Set Vercel Project environment variables from `.env.example` (especially `DATABASE_URL`, `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL`, and `CRON_SECRET`).
2. (Optional) If you also set `DIRECT_DATABASE_URL` (session pooler / native), Prisma migrations + seed will prefer it (migrations use it via `prisma.config.ts`), and seed will still fall back to `DATABASE_URL` if direct is unreachable.
3. Deploy to Vercel (first deploy may take longer because migrations/seed run during build).
4. Verify:
   - `GET /api/health` returns `ok`
   - The cron endpoint `GET /api/cron/process-sync-jobs` works with header `Authorization: Bearer <CRON_SECRET>` (Vercel sets this automatically when `CRON_SECRET` is configured).
   - On Vercel Hobby plans, cron is scheduled once/day: `0 3 * * *` (UTC by Vercel).

## Local Telegram bot testing (ngrok)

1. Run `ngrok http 3000` (or your dev port) and copy the **exact** HTTPS URL from the **Forwarding** line (typically `https://….ngrok-free.app`).
2. Set `NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL` to that HTTPS origin (no trailing slash), restart `bun dev`.
3. Saving a school’s **bot token** automatically calls Telegram **setWebhook** with this public origin and `secret_token = schoolKey`. On **edit**, the webhook must succeed before the new token is written; on **create**, the school is stored first, then setWebhook runs (if that step fails, fix env and save the token again).
4. Use the **Webhook для Telegram** box to copy URL / curl for debugging; it should match what the server resolves (`NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL` or non-localhost `NEXT_PUBLIC_APP_URL`, or `VERCEL_URL` on Vercel).

