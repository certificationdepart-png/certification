# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
bun dev                    # Start dev server
bun build                  # Production build
bun lint                   # ESLint
bun typecheck              # tsc --noEmit
bun test                   # Run all tests (Vitest)
bun test <pattern>         # Run single test file, e.g. bun test stage3
bun db:migrate             # Create and apply migrations (dev)
bun db:migrate:deploy      # Apply existing migrations (prod/CI)
bun db:reset               # Drop and re-migrate + seed (destructive)
bun db:seed                # Seed default admin + demo data
bun db:generate            # Regenerate Prisma client after schema changes
bun prisma:validate        # Validate schema
```

Bootstrap from scratch: `bun install && bun db:migrate && bun db:seed && bun dev`
Default seeded login: `admin@example.com` / `changeme123`

## Architecture

This is a **multi-tenant certificate distribution platform** for Ukrainian schools. The primary user interface is a **Telegram bot** — students apply for certificates via a multi-step bot dialog. School admins manage everything through a web dashboard.

### Request flow

1. Telegram sends updates to `POST /api/telegram/webhook` (one endpoint per bot token; requests are authenticated via `secret_token = schoolKey`)
2. `telegram-webhook.service.ts` validates and routes updates
3. `telegram-dialog.service.ts` runs an 11-step state machine (enum `SessionStep`) persisted per-user in `UserSession`
4. Completed applications are stored in `Application` → queued into `SyncJob` → async worker at `GET /api/cron/process-sync-jobs` syncs them to Google Sheets

### Service layer (`src/services/`)

| File | Purpose |
|------|---------|
| `telegram-dialog.service.ts` | Core dialog state machine (~87 KB). Each `SessionStep` maps to a question; transitions write to `UserSession.dialogData`. |
| `google-sheets-sync.service.ts` | Maps `Application` rows to Google Sheets columns; processes `SyncJob` queue (max 20/run). |
| `applications.service.ts` | Application CRUD, status transitions (new → submitted → approved/rejected). |
| `schools.service.ts` | Multi-tenant school management; bot tokens are AES-256-GCM encrypted via `src/lib/crypto.ts`. |
| `nova-poshta.service.ts` | Nova Poshta API for delivery address lookup (Ukraine). |
| `outbox.service.ts` | Outbox pattern for async Telegram notification delivery. |

### Multi-tenancy

Each `School` row owns its own Telegram bot token (encrypted at rest). The `UserSession` table tracks per-user dialog state scoped to a school. `MessageTemplate` stores localized bot messages per school (defaults in `src/lib/template-defaults.ts`).

### Auth

`better-auth` with email/password. Auth config: `src/lib/auth.ts`. All `/api/auth/*` is handled by `src/app/api/auth/[...all]/route.ts`. The `(admin)` route group is protected via middleware in `src/app/(admin)/layout.tsx`.

### Async jobs

`SyncJob` table is a durable queue. The cron endpoint (`/api/cron/process-sync-jobs`) is called by Vercel cron (`0 3 * * *`) and requires `Authorization: Bearer <CRON_SECRET>`. Health status: `GET /api/health`.

## Database notes

After any `schema.prisma` change, run `bun db:generate` and restart `bun dev`.

**`SessionStep` enum** (`q1_start` … `q11_finish`) lives in the DB. If a new step is missing in a deployed DB, run `bun db:migrate:deploy`. On PostgreSQL < 12, `ALTER TYPE … ADD VALUE` inside a transaction fails — execute it manually outside a transaction.

## Local Telegram bot testing

Telegram cannot reach `localhost`. Use ngrok:
1. `ngrok http 3000` → copy the `https://….ngrok-free.app` URL
2. Set `NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL` to that URL (no trailing slash), restart dev
3. Saving a school's bot token triggers `setWebhook` automatically

## Environment variables

Required: `DATABASE_URL`, `AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`
Optional: `DIRECT_DATABASE_URL` (Prisma migrations prefer this if set), `CRON_SECRET` (required on Vercel), `TELEGRAM_BOT_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON_B64` (base64-encoded; safer than raw JSON), `NOVA_POSHTA_API_KEY`, `DATA_ENCRYPTION_KEY`
