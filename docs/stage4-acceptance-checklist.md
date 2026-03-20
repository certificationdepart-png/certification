# Stage 4 — Acceptance walk-through checklist

## Scope (from roadmap)

- Applications page: Table + Kanban views
- Application detail: full data, screenshots, status history, chat history
- Manager operations: mark checked, change status
- Confirmation notifications via Telegram

---

## Checklist

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **Applications page loads** | ⬜ | `/applications` renders without error (manual) |
| 2 | **Table view** | ⬜ | Table shows columns: student, status, delivery, courses, date; search, filters, pagination (manual) |
| 3 | **Kanban view** | ⬜ | Columns by status; cards draggable; status changes on drop (manual) |
| 4 | **Application detail page loads** | ⬜ | `/applications/[id]` loads for valid ID (manual) |
| 5 | **Detail: application fields** | ⬜ | PIB (UA/EN), delivery, courses, score, feedback visible (manual) |
| 6 | **Detail: screenshots** | ⬜ | Screenshots render from Telegram file_id (via API proxy) (manual) |
| 7 | **Detail: status history** | ⬜ | Status history list visible (manual) |
| 8 | **Detail: chat history** | ⬜ | Chat shows user + bot messages (full dialog) with prompt-kit UI (manual) |
| 9 | **Confirm application** | ⬜ | "Підтвердити" / статус `approved` sets `managerCheckedAt` and triggers client notifications per school templates |
| 10 | **Status change** | ⬜ | Status dropdown works; creates status history record (manual) |
| 11 | **Confirmation notifications** | ⬜ | On approve, Telegram messages sent (manual, requires bot) |
| 12 | **API contracts** | ✅ | GET /api/applications, GET/PATCH /api/applications/[id], GET chat-history implemented |
| 13 | **Tests pass** | ✅ | `pnpm test` — 17 tests, 6 stage4-applications |
| 14 | **Build passes** | ✅ | `pnpm run build` — success |

---

## Run commands

```bash
pnpm run build
pnpm test
pnpm dev   # then manually walk through 1–11
```

---

## 2026-03-19 check results

- **Build**: ✅ Pass
- **Tests**: ✅ 17 passed (including 6 stage4-applications)
- **Fix applied**: `getApplicationChatHistory` now safely handles `prisma.outgoingMessageLog` undefined (dev hot-reload edge case) — returns empty array for bot messages if delegate missing

If the application detail page still returns 500, restart the dev server (`Ctrl+C` then `pnpm dev`) so the Prisma client picks up `OutgoingMessageLog` after migration.
