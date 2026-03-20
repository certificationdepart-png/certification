/**
 * Google Sheets 1:1 sync for applications.
 * Maps Application to sheet row per docs/work-scope.md "Заявки" structure.
 */

import type { ApplicationStatus, DeliveryMode, Prisma } from "@prisma/client";

import { env } from "@/lib/env";
import { formatDate } from "@/lib/format-datetime";
import { observability } from "@/lib/observability";
import { prisma } from "@/lib/db";
import { resolvePublicAppBaseUrl } from "@/lib/app-url";
import { routes } from "@/lib/routes";

const MAX_SYNC_ATTEMPTS = 5;

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "новий",
  submitted: "на перевірці",
  approved: "підтверджено",
  rejected: "відхилено",
};

const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  none: "—",
  ua: "Україна",
  abroad: "за кордон",
};

export type ApplicationForSync = {
  courses: Array<{
    course: {
      title: string;
      bprSpecialtyCheckLink: string | null;
      bprTestLink: string | null;
    };
    bprRequired: boolean;
  }>;
  screenshots?: Array<{ id: string }>;
  _count?: { screenshots: number };
  createdAt: Date;
  deliveryMode: DeliveryMode;
  status: ApplicationStatus;
  telegramUserId: string;
  telegramUsername: string | null;
  studentNameUa: string;
  studentNameEn: string;
  deliveryCity: string | null;
  deliveryBranch: string | null;
  score: number | null;
  feedbackText: string | null;
};

/**
 * Map application to row values for columns A–N.
 * Column mapping from docs/work-scope.md.
 */
export function applicationToRowValues(
  app: ApplicationForSync,
  adminApplicationUrl: string | null,
): (string | number)[] {
  const courseTitles = app.courses.map((c) => c.course.title).join(", ");
  const screenshotCount = app._count?.screenshots ?? app.screenshots?.length ?? 0;
  const statusLabel = STATUS_LABELS[app.status] ?? app.status;
  const deliveryLabel = DELIVERY_LABELS[app.deliveryMode] ?? "—";

  const anyBprRequired = app.courses.some((c) => c.bprRequired);

  return [
    statusLabel,
    app.createdAt instanceof Date ? formatDate(app.createdAt) : String(app.createdAt),
    app.telegramUserId,
    app.telegramUsername ?? "",
    deliveryLabel,
    courseTitles,
    app.studentNameUa,
    app.studentNameEn,
    app.deliveryCity ?? "",
    app.deliveryBranch ?? "",
    screenshotCount,
    app.score ?? "",
    app.feedbackText ?? "",
    anyBprRequired ? "Так" : "Ні",
    toAdminApplicationHyperlink(adminApplicationUrl),
    statusLabel,
  ];
}

function escapeSheetsFormulaString(value: string): string {
  // In Sheets formulas, `"` is escaped by doubling it.
  return value.replace(/"/g, '""');
}

function toAdminApplicationHyperlink(adminApplicationUrl: string | null): string {
  if (!adminApplicationUrl) return "";
  const safeUrl = escapeSheetsFormulaString(adminApplicationUrl);
  // Label can be anything; keep it short to fit better in the sheet UI.
  // UA Sheets locale commonly uses `;` between HYPERLINK args.
  return `=HYPERLINK("${safeUrl}";"Відкрити")`;
}

function toBprLinkHyperlink(url: string | null, label: string): string {
  if (!url) return "";
  const safeUrl = escapeSheetsFormulaString(url);
  const safeLabel = escapeSheetsFormulaString(label);
  return `=HYPERLINK("${safeUrl}";"${safeLabel}")`;
}

function getSheetsClient() {
  const b64 = env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  const jsonFromEnv = env.GOOGLE_SERVICE_ACCOUNT_JSON;

  let json: string | undefined;
  if (b64) {
    try {
      json = Buffer.from(b64, "base64").toString("utf8");
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_B64 is not valid base64");
    }
  } else {
    json = jsonFromEnv;
  }

  if (!json) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON (or ..._B64) is not configured");
  }

  const raw = json.trim();
  const candidates: string[] = [raw];

  // Some `.env` setups can accidentally wrap the whole JSON string in quotes.
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    candidates.push(raw.slice(1, -1));
  }

  let credentials: { client_email?: string; private_key?: string } | undefined;
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      credentials = JSON.parse(candidate) as {
        client_email?: string;
        private_key?: string;
      };
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!credentials || !credentials.client_email || !credentials.private_key) {
    const start = raw.slice(0, 80).replace(/\n/g, "\\n");
    throw new Error(
      [
        "Invalid Google service account JSON for GOOGLE_SERVICE_ACCOUNT_JSON (or ..._B64).",
        lastErr ? `Parse error: ${String(lastErr)}` : undefined,
        "Ensure the env value contains valid JSON starting with `{` and ending with `}`.",
        `Value starts with: ${start}${raw.length > 80 ? "..." : ""}`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  // Dynamic import to avoid loading googleapis when env is missing
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { google } = require("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * Ensure header row exists in the sheet. Creates it if missing.
 */
async function ensureHeaderRow(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  worksheetTitle: string,
): Promise<void> {
  const range = buildA1Range(worksheetTitle, "A1:P1");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const rows = res.data.values as string[][] | undefined;

  const headers = [
    "Статус",
    "Дата",
    "TG ID",
    "Username",
    "Тип",
    "Курс",
    "ПІБ укр",
    "ПІБ анг",
    "Місто",
    "Відділення",
    "Скріни",
    "Оцінка",
    "Відгук",
    "БПР (потрібне)",
    "Посилання на заявку (адмін)",
    "Статус",
  ] as const;

  // Delete extra columns beyond what we need (if present from old runs).
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId,sheets.properties.gridProperties.columnCount",
  });
  const sheetProps = (meta.data.sheets ?? [])
    .map((s: any) => s.properties)
    .find((p: any) => p?.title === worksheetTitle);
  const columnCount: number = Number(sheetProps?.gridProperties?.columnCount ?? 0);

  if (sheetProps?.sheetId != null && columnCount > headers.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetProps.sheetId,
                dimension: "COLUMNS",
                startIndex: headers.length,
                endIndex: columnCount,
              },
            },
          },
        ],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [headers as unknown as string[]] },
  });
}

/**
 * Upsert application row: update if externalRowId exists, else append and store.
 */
export async function upsertApplicationRow(
  schoolId: string,
  applicationId: string,
): Promise<{ externalRowId: number }> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_SERVICE_ACCOUNT_JSON_B64) {
    throw new Error("Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_JSON or ..._B64)");
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { googleSheetId: true, slug: true, name: true },
  });
  if (!school) {
    throw new Error("School not found");
  }

  const application = await prisma.application.findFirst({
    where: { id: applicationId, schoolId },
    include: {
      courses: {
        include: {
          course: {
            select: {
              title: true,
              bprSpecialtyCheckLink: true,
              bprTestLink: true,
            },
          },
        },
      },
      _count: { select: { screenshots: true } },
    },
  });
  if (!application) {
    throw new Error("Application not found");
  }

  const sheets = getSheetsClient();
  const spreadsheetId = school.googleSheetId;
  // Each school uses its own worksheet tab inside the spreadsheet.
  // Requested behavior: use ONLY the human `name` (no slug fallback).
  const worksheetTitle = school.name;
  if (!worksheetTitle) {
    throw new Error("School.name is required to create/use worksheet tab");
  }

  await ensureWorksheetExists(sheets, spreadsheetId, worksheetTitle);
  await ensureHeaderRow(sheets, spreadsheetId, worksheetTitle);

  const publicBaseUrl = resolvePublicAppBaseUrl();
  const adminApplicationUrl = publicBaseUrl ? `${publicBaseUrl}${routes.admin.applicationDetail(applicationId)}` : null;

  const rowValues = applicationToRowValues(application as unknown as ApplicationForSync, adminApplicationUrl);
  const dataRange = buildA1Range(worksheetTitle, "A:P");

  if (application.externalRowId != null) {
    const rowIndex = application.externalRowId;
    const range = buildA1Range(worksheetTitle, `A${rowIndex}:P${rowIndex}`);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowValues] },
    });
    return { externalRowId: rowIndex };
  }

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: dataRange,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowValues] },
  });

  const updatedRange = appendRes.data.updates?.updatedRange;
  if (!updatedRange) {
    throw new Error("Failed to get appended row range");
  }

  const match = updatedRange.match(/!A(\d+)/);
  const rowNumber = match ? parseInt(match[1], 10) : 0;
  if (rowNumber < 1) {
    throw new Error("Could not determine row number from append response");
  }

  try {
    await prisma.application.update({
      where: { id: applicationId },
      data: { externalRowId: rowNumber },
    });
    return { externalRowId: rowNumber };
  } catch (err) {
    // Under concurrent runs/retries, the Sheets "append" can still end up
    // returning the same row index for two different requests. That causes
    // a DB unique constraint violation on (schoolId, externalRowId).
    if ((err as Prisma.PrismaClientKnownRequestError)?.code !== "P2002") {
      throw err;
    }

    // Try to resolve by finding the row that matches this application
    // around the originally parsed `rowNumber`.
    const resolvedRowNumber = await findRowNumberForApplication(
      sheets,
      spreadsheetId,
      worksheetTitle,
      application as unknown as ApplicationForSync,
      rowNumber,
    );

    if (!resolvedRowNumber) {
      throw err;
    }

    await prisma.application.update({
      where: { id: applicationId },
      data: { externalRowId: resolvedRowNumber },
    });

    return { externalRowId: resolvedRowNumber };
  }
}

/**
 * Enqueue a sync job for an application. Idempotent: skips if pending job exists.
 */
export async function enqueueSyncJob(schoolId: string, applicationId: string): Promise<void> {
  const existing = await prisma.syncJob.findFirst({
    where: { applicationId, status: "pending" },
  });
  if (existing) return;

  await prisma.syncJob.create({
    data: {
      schoolId,
      applicationId,
      status: "pending",
    },
  });
}

async function claimSyncJobById(jobId: string) {
  const updated = await prisma.syncJob.updateMany({
    where: { id: jobId, status: "pending" },
    data: {
      status: "processing",
      processingStartedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    return null;
  }

  return prisma.syncJob.findUnique({
    where: { id: jobId },
  });
}

async function claimNextPendingSyncJob() {
  const job = await prisma.syncJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!job) {
    return null;
  }

  const claimed = await prisma.syncJob.updateMany({
    where: { id: job.id, status: "pending" },
    data: {
      status: "processing",
      processingStartedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    return null;
  }

  return prisma.syncJob.findUnique({
    where: { id: job.id },
  });
}

async function claimNextPendingSyncJobForSchool(schoolId: string) {
  const job = await prisma.syncJob.findFirst({
    where: { status: "pending", schoolId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!job) {
    return null;
  }

  const claimed = await prisma.syncJob.updateMany({
    where: { id: job.id, status: "pending" },
    data: {
      status: "processing",
      processingStartedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    return null;
  }

  return prisma.syncJob.findUnique({
    where: { id: job.id },
  });
}

async function processClaimedSyncJob(job: { id: string; schoolId: string; applicationId: string; attemptCount: number }) {
  const attempt = job.attemptCount + 1;
  try {
    await upsertApplicationRow(job.schoolId, job.applicationId);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        attemptCount: attempt,
        completedAt: new Date(),
        lastError: null,
      },
    });
    observability.increment("sync.processed.total");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (attempt >= MAX_SYNC_ATTEMPTS) {
      await prisma.syncError.create({
        data: {
          syncJobId: job.id,
          message,
          payload: { applicationId: job.applicationId, attempt },
        },
      });
      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          attemptCount: attempt,
          completedAt: new Date(),
          lastError: message,
        },
      });
      observability.increment("sync.failed.total");
    } else {
      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: "pending",
          attemptCount: attempt,
          lastError: message,
          processingStartedAt: null,
        },
      });
    }
    throw err;
  }
}

/**
 * Process a specific sync job by ID. Returns true if processed successfully.
 */
export async function processSyncJobById(jobId: string): Promise<boolean> {
  const job = await claimSyncJobById(jobId);
  if (!job) return false;
  return processClaimedSyncJob(job);
}

/**
 * Process one pending sync job. Returns true if a job was processed.
 */
export async function processOneSyncJob(): Promise<boolean> {
  const job = await claimNextPendingSyncJob();
  if (!job) return false;
  return processClaimedSyncJob(job);
}

/**
 * Process one pending sync job for a specific school (used by the admin "Re-sync" button).
 */
export async function processOneSyncJobForSchool(schoolId: string): Promise<boolean> {
  const job = await claimNextPendingSyncJobForSchool(schoolId);
  if (!job) return false;
  return processClaimedSyncJob(job);
}

function quoteSheetTitleForA1(sheetTitle: string): string {
  // Google Sheets A1 notation requires tab names with special characters to be quoted.
  // Escaping rule: single quote inside the title is doubled.
  return `'${sheetTitle.replace(/'/g, "''")}'`;
}

function buildA1Range(sheetTitle: string, a1Range: string): string {
  return `${quoteSheetTitleForA1(sheetTitle)}!${a1Range}`;
}

async function ensureWorksheetExists(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  worksheetTitle: string,
): Promise<void> {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const sheetList = (res.data.sheets ?? []) as Array<{
    properties?: { title?: string };
  }>;

  const existingTitles = new Set<string>(
    sheetList
      .map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === "string" && t.length > 0),
  );

  if (existingTitles.has(worksheetTitle)) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: worksheetTitle },
          },
        },
      ],
    },
  });
}

async function findRowNumberForApplication(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  worksheetTitle: string,
  application: ApplicationForSync & { createdAt: Date; telegramUserId: string },
  nearRowNumber: number,
): Promise<number | null> {
  // Mapping used by `applicationToRowValues`:
  // B = Date, C = TG ID
  const expectedDate = formatDate(application.createdAt);
  const expectedTgId = application.telegramUserId;

  const windowSize = 15;
  const startRow = Math.max(1, nearRowNumber - windowSize);
  const endRow = nearRowNumber + windowSize;

  const range = buildA1Range(worksheetTitle, `B${startRow}:C${endRow}`);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const values = res.data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    const row = startRow + i;
    const b = values[i]?.[0];
    const c = values[i]?.[1];
    if (b === expectedDate && c === expectedTgId) {
      return row;
    }
  }

  return null;
}
