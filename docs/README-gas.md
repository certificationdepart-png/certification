# Google Sheets Automatization — Telegram Bot

Google Apps Script automation: Telegram bot that collects student certificate requests into Google Sheets, integrates with Nova Poshta API for delivery, posts requests to a manager Telegram chat, and auto-confirms when a manager checks a checkbox.

## Prerequisites

- A Google account
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- A Nova Poshta API key (from [developers.novaposhta.ua](https://developers.novaposhta.ua/))

## Setup

1. Create a new Google Spreadsheet.
2. Open **Extensions > Apps Script**.
3. In the Apps Script editor, create a separate `.gs` file for each file in this repo's `src/` folder (e.g. `Code.gs`, `Config.gs`, `TelegramApi.gs`, etc.) and paste the contents.
4. Open the manifest: **Project Settings > Show "appsscript.json" manifest file**, then replace its contents with the contents of `src/appsscript.json`.

### Configuration

1. Open `Config.gs` in the Apps Script editor and fill in:
   - `BOT_TOKEN` — your Telegram bot token
   - `SPREADSHEET_ID` — the Google Sheet ID (from the spreadsheet URL: `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`)
   - `NP_API_KEY` — your Nova Poshta API key

2. Run `setupAll()` from the script editor (select it in the function dropdown, then click Run). This will:
   - Create and style the `Заявки` (Applications) sheet
   - Create and style the `Налаштування` (Settings) sheet
   - Install the `onEdit` trigger for checkbox automation
   - Grant the required permissions on first run

3. Fill in the `Налаштування` sheet:
   - `A2` — Telegram Chat ID where applications should be sent
   - Column `B` — Course names (one per row, starting from B2)
   - Column `C` — Task descriptions for each course (what screenshots are needed)
   - Column `D` — Certificate type per course: `електронний` or `фізичний`
   - Column `E` — Processing term in days (number)
   - `F2` — URL for leaving a review

4. Deploy as a Web App:
   - In Apps Script: **Deploy > New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the Web App URL

5. Run `registerWebhook()` from the script editor to connect the bot to Telegram.

## Files Overview

Each file in `src/` corresponds to a separate script file in the Apps Script editor:

| File | Purpose |
|---|---|
| `appsscript.json` | GAS manifest (scopes, runtime, timezone) |
| `Code.gs` | `doPost` / `doGet` entry points for the webhook |
| `Config.gs` | Bot token, sheet ID, API keys, column constants |
| `TelegramApi.gs` | Telegram Bot API wrappers |
| `BotFlow.gs` | Conversation state machine (11 steps) |
| `StateManager.gs` | User session management via ScriptProperties |
| `SheetsService.gs` | Google Sheets read/write operations |
| `NovaPoshtaApi.gs` | Nova Poshta city/warehouse search |
| `NotificationService.gs` | Send application summaries to Telegram chat |
| `CheckboxTrigger.gs` | `onEdit` handler for manager confirmation |
| `Setup.gs` | One-time setup: styling, triggers, webhook |

## How It Works

1. Student starts the bot and selects course(s)
2. Bot asks for screenshot proof of completed assignments
3. Student chooses certificate type (electronic/physical/both)
4. Student enters their name in Ukrainian and English
5. If physical certificate: delivery address via Nova Poshta API integration
6. Student rates the course (1-10) and optionally leaves a review
7. Bot shows a summary for confirmation
8. Data is written to Google Sheets and sent to the manager chat
9. Manager reviews and checks the checkbox — bot auto-sends confirmation to the student

## Notes

- All logic runs entirely on Google Apps Script — no external servers needed.
- Screenshots are stored as Telegram `file_id` strings (no Google Drive integration required).
- `LockService` is used for concurrent sheet writes to prevent race conditions.
- Telegram inline keyboards are used for all button interactions.
