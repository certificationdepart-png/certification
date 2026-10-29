# Certification — Safe staged release V2.1 (29.10.2026)

**Status: candidate only; NOT deployed. GitHub HEAD and Vercel production SHA have NOT been verified.**

## Changes from V2

- `vercel.json` removes both **seed and database migration** operations from build. Migrations must be reviewed and run separately only if actually required. This release does not contain new schema migrations.
- `delayed-followups.service.ts` dispatcher selects only event IDs starting with `followup:` **and** `createdAt >= DELAYED_FOLLOWUPS_START_AT`. Legacy random-ID events cannot be sent even if start time is wrong.
- A GitHub Actions workflow provides locked installation, static guards, Prisma generation/validation, type checking, linting, Vitest and a Next.js build **without actual database access**. It runs on PRs to `main`, and can be run manually.
- Static safety assertions (Node test runner) can be executed locally without installing project dependencies.

## Stage A: no delayed sends

1. Confirm repository `main` HEAD SHA matches the zip baseline: `1c16724f0ebd9326ee62d760fde49aab87fce40f`. If different, **STOP**: review/rebase instead of applying this patch blindly.
2. Review patch and open a **PR from a separate branch**, not a direct push to `main`. A preview deployment, if automatic, must not carry live production integrations for interactive tests.
3. CI must pass: static guards, `bun install --frozen-lockfile`, Prisma generate/validate, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` (no migrations, no seed).
4. Confirm Production Vercel has existing `CRON_SECRET`. If missing, the original daily Cron will return 401 after deploy; set it in Vercel (do not share with chat or commit). Ensure current deployment uses correct production DB.
5. Before merging ensure Vercel **Production** env `DELAYED_FOLLOWUPS_ENABLED=false`, and `DELAYED_FOLLOWUPS_START_AT=2099-01-01T00:00:00Z` or another future UTC timestamp. Do not create a Supabase cron schedule yet. Optionally configure a new `DELAYED_CRON_SECRET` of 32+ characters for future use, stored only in Vercel.
6. Merge only after approvals. Check deployed commit SHA in Vercel, status of the dashboard, login of existing admin, forbidden new signups, Cron authentication, applications and Sheets synchronization. Avoid confirmations to real students during smoke tests.
7. Confirm `db:seed` did not run and `admin@example.com` still has role `user`, no password and no sessions; recheck RLS and grants and keep Data API disabled.

## Stage B: future follow-ups only, separate authorization and activation

1. Choose real future UTC activation time **after Stage A is live**; retain `DELAYED_FOLLOWUPS_ENABLED=false` until ready. Ensure the 412 old events and any additional legacy events are cancelled. New dispatcher also filters on ID prefix.
2. Set same 32+ character `DELAYED_CRON_SECRET` in Production Vercel and Supabase Vault under `certification_delayed_cron_secret`; never store it in SQL literals/commit.
3. Set `DELAYED_FOLLOWUPS_START_AT` to chosen future UTC moment and `DELAYED_FOLLOWUPS_ENABLED=true`; deploy this env update safely. If stage A still live in some other production deployment, ensure it cannot continue writing events.
4. Test **only a controlled application and test Telegram chat** (ideally separate test DB). Verify `followup:` ID and notification schedule; no manual sending to real users.
5. After tests, run `ops/02_activate_followup_cron_AFTER_DEPLOY.sql`, confirm scheduling then monitor `ops/04_followup_monitor_READ_ONLY.sql`. `pg_cron` and `pg_net` have been installed but no cron jobs were present at last check.
6. STOP if messages unexpectedly queue or fail: `ops/03_stop_followup_cron.sql`, then disable `DELAYED_FOLLOWUPS_ENABLED` through Vercel and redeploy. Don't auto-retry ambiguous messages (`needs_review`/`processing`) before manual reconciliation.

## Important caveats

- The previously created V2 patch MUST NOT be stacked on top of V2.1; use **one** reviewed patch.
- Local static checks do not replace integration tests or real GitHub CI. No production release should occur while GitHub HEAD is unverified.
- Database RLS/grants remain overly broad at PostgreSQL role level; Data API disable reduces network exposure but a complete privileges audit is a separate P0 task.
- Production secrets, backups and PII must never enter GitHub, CI logs or chat.
