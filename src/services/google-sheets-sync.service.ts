/**
 * Google Sheets sync for applications.
 * One row per ApplicationCourse — each course in an application gets its own sheet row.
 * Column mapping from docs/work-scope.md "Заявки" structure (A–S, 19 columns).
 */

import type { ApplicationStatus, CertificateFormat, DeliveryMode } from "@prisma/client";
import { google } from "googleapis";

import { env } from "@/lib/env";
import { formatSheetDate } from "@/lib/format-datetime";
import { observability } from "@/lib/observability";
import { prisma } from "@/lib/db";
import { resolvePublicAppBaseUrl } from "@/lib/app-url";
import { routes } from "@/lib/routes";

const MAX_SYNC_ATTEMPTS = 5;
const BASE_SYNC_RETRY_DELAY_MS = 30_000;
const MAX_SYNC_RETRY_DELAY_MS = 15 * 60_000;

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

const CERTIFICATE_FORMAT_LABELS: Record<CertificateFormat, string> = {
  electronic: "Електронний",
  physical: "Фізичний",
  both: "Електронний і фізичний",
};

export type ApplicationCourseForSync = {
  id: string;
  externalRowId: number | null;
  certificateFormat: CertificateFormat;
  bprRequired: boolean;
  course: {
    title: string;
    bprSpecialtyCheckLink: string | null;
    bprTestLink: string | null;
  };
};

export type ApplicationForSync = {
  courses: ApplicationCourseForSync[];
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
  deliveryAddress: string | null;
  deliveryCountry: string | null;
  deliveryPhone: string | null;
  deliveryEmail: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  score: number | null;
  feedbackText: string | null;
};

type ParsedUpdatedRange = {
  startColumn: string;
  endColumn: string;
  rowNumber: number;
};

type FindMatchingCourseRowNumbersOptions = {
  requireAdminLink?: boolean;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorResponseStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as { response?: { status?: unknown } }).response;
  if (typeof response?.status === "number") return response.status;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "number") return code;
  if (typeof code === "string" && /^\d+$/.test(code)) return Number.parseInt(code, 10);
  return null;
}

function getHeaderValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === "function") {
    const value = getter.call(headers, name);
    return value == null ? null : String(value);
  }
  const record = headers as Record<string, unknown>;
  const lowerName = name.toLowerCase();
  const value = record[name] ?? record[lowerName];
  return value == null ? null : String(value);
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, 0);
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) return Math.max(timestamp - Date.now(), 0);
  return null;
}

export function getGoogleSheetsRateLimitRetryDelayMs(error: unknown, attempt: number): number | null {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorResponseStatus(error);
  const isRateLimited =
    status === 429 ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("too many requests");

  if (!isRateLimited) return null;

  const headers = (error as { response?: { headers?: unknown } })?.response?.headers;
  const retryAfterMs = parseRetryAfterMs(getHeaderValue(headers, "retry-after"));
  const exponentialDelayMs = Math.min(BASE_SYNC_RETRY_DELAY_MS * 2 ** Math.max(attempt - 1, 0), MAX_SYNC_RETRY_DELAY_MS);
  return Math.min(Math.max(retryAfterMs ?? 0, exponentialDelayMs), MAX_SYNC_RETRY_DELAY_MS);
}

/**
 * Map a single ApplicationCourse to row values for columns A–S (19 columns).
 * Each course in an application gets its own row with course-specific columns F, P, S.
 *
 * Column layout:
 *   A Статус | B Дата | C TG ID | D Username | E Тип | F Курс | G ПІБ укр | H ПІБ анг |
 *   I Місто/Адреса | J Відділення | K ПІБ отримувача | L Телефон отримувача |
 *   M Скріни | N Оцінка | O Відгук | P БПР | Q Посилання (адмін) | R Статус | S Формат
 */
export function applicationCourseToRowValues(
  app: ApplicationForSync,
  ac: ApplicationCourseForSync,
  adminApplicationUrl: string | null,
): (string | number)[] {
  const screenshotCount = app._count?.screenshots ?? app.screenshots?.length ?? 0;
  const statusLabel = STATUS_LABELS[app.status] ?? app.status;
  const deliveryLabel = DELIVERY_LABELS[app.deliveryMode] ?? "—";
  const certFormatLabel = CERTIFICATE_FORMAT_LABELS[ac.certificateFormat] ?? ac.certificateFormat;

  let colI: string;  // Місто / Адреса
  let colJ: string;  // Відділення
  let colK: string;  // ПІБ отримувача
  let colL: string;  // Телефон отримувача

  if (app.deliveryMode === "abroad") {
    const country = app.deliveryCountry && app.deliveryCountry !== "—" ? app.deliveryCountry : null;
    const address = app.deliveryAddress && app.deliveryAddress !== "—" ? app.deliveryAddress : null;
    const combined = [country, address].filter(Boolean).join(", ");
    colI = combined.length > 150 ? `${combined.slice(0, 147)}…` : combined || "за кордон";
    colJ = "";
    colK = "";
    const phone = app.deliveryPhone && app.deliveryPhone !== "—" ? app.deliveryPhone : null;
    const email = app.deliveryEmail && app.deliveryEmail !== "—" ? app.deliveryEmail : null;
    if (!phone && email) {
      colL = `Email: ${email}`;
    } else {
      colL = [phone, email].filter(Boolean).join(" / ") || "";
    }
  } else if (app.deliveryMode === "ua") {
    colI = app.deliveryCity ?? "";
    colJ = app.deliveryBranch ?? "";
    colK = app.recipientName ?? "";
    colL = app.recipientPhone ?? "";
  } else {
    // deliveryMode === "none" (electronic certificate)
    colI = "";
    colJ = "";
    colK = "";
    const email = app.deliveryEmail && app.deliveryEmail !== "—" ? app.deliveryEmail : null;
    colL = email ? `Email: ${email}` : "";
  }

  return [
    statusLabel,                                                                            // A
    app.createdAt instanceof Date ? formatSheetDate(app.createdAt) : String(app.createdAt), // B
    app.telegramUserId,                                                                     // C
    app.telegramUsername ?? "",                                                             // D
    deliveryLabel,                                                                          // E
    ac.course.title,                                                                        // F — single course title
    app.studentNameUa,                                                                      // G
    app.studentNameEn,                                                                      // H
    colI,                                                                                   // I — Місто / Адреса
    colJ,                                                                                   // J — Відділення
    colK,                                                                                   // K — ПІБ отримувача
    colL,                                                                                   // L — Телефон отримувача
    screenshotCount,                                                                        // M
    app.score ?? "",                                                                        // N
    app.feedbackText ?? "",                                                                 // O
    ac.bprRequired ? "Так" : "Ні",                                                         // P — per-course BPR flag
    toAdminApplicationHyperlink(adminApplicationUrl),                                       // Q
    statusLabel,                                                                            // R
    certFormatLabel,                                                                        // S — certificate format chosen by student
  ];
}

export function parseUpdatedRange(updatedRange: string): ParsedUpdatedRange | null {
  const match = updatedRange.match(/!([A-Z]+)(\d+)(?::([A-Z]+)\d+)?$/);
  if (!match) {
    return null;
  }

  const rowNumber = Number.parseInt(match[2], 10);
  if (!Number.isInteger(rowNumber) || rowNumber < 1) {
    return null;
  }

  return {
    startColumn: match[1],
    endColumn: match[3] ?? match[1],
    rowNumber,
  };
}

/** @deprecated Use applicationCourseToRowValues instead. Kept for backward compatibility. */
export function applicationToRowValues(
  app: ApplicationForSync,
  adminApplicationUrl: string | null,
): (string | number)[] {
  const firstCourse = app.courses[0];
  if (!firstCourse) {
    // Fallback: empty course data
    const screenshotCount = app._count?.screenshots ?? app.screenshots?.length ?? 0;
    const statusLabel = STATUS_LABELS[app.status] ?? app.status;
    const deliveryLabel = DELIVERY_LABELS[app.deliveryMode] ?? "—";
    return [
      statusLabel,
      app.createdAt instanceof Date ? formatSheetDate(app.createdAt) : String(app.createdAt),
      app.telegramUserId,
      app.telegramUsername ?? "",
      deliveryLabel,
      "",
      app.studentNameUa,
      app.studentNameEn,
      app.deliveryCity ?? "",
      app.deliveryBranch ?? "",
      "",
      "",
      screenshotCount,
      app.score ?? "",
      app.feedbackText ?? "",
      "Ні",
      toAdminApplicationHyperlink(adminApplicationUrl),
      statusLabel,
      "",
    ];
  }
  return applicationCourseToRowValues(app, firstCourse, adminApplicationUrl);
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

export function findMatchingCourseRowNumbers(
  rows: unknown[][],
  application: ApplicationForSync & { createdAt: Date; telegramUserId: string },
  course: ApplicationCourseForSync,
  adminApplicationUrl: string | null,
  options: FindMatchingCourseRowNumbersOptions = {},
): number[] {
  const expectedDate = formatSheetDate(application.createdAt);
  const expectedTgId = application.telegramUserId;
  const expectedCourseTitle = course.course.title;
  const expectedNameUa = application.studentNameUa;
  const expectedNameEn = application.studentNameEn;
  const expectedCertFormat = CERTIFICATE_FORMAT_LABELS[course.certificateFormat] ?? course.certificateFormat;
  const expectedAdminLink = toAdminApplicationHyperlink(adminApplicationUrl);

  const strictMatches: number[] = [];
  const looseMatches: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowValues = rows[i] ?? [];
    const rowNumber = i + 2;

    for (let offset = 0; offset + 18 < rowValues.length; offset++) {
      if (
        normalizeSheetCell(rowValues[offset + 1]) !== expectedDate ||
        normalizeSheetCell(rowValues[offset + 2]) !== expectedTgId ||
        normalizeSheetCell(rowValues[offset + 5]) !== expectedCourseTitle ||
        normalizeSheetCell(rowValues[offset + 6]) !== expectedNameUa ||
        normalizeSheetCell(rowValues[offset + 7]) !== expectedNameEn ||
        normalizeSheetCell(rowValues[offset + 18]) !== expectedCertFormat
      ) {
        continue;
      }

      const hasExpectedAdminLink =
        expectedAdminLink.length > 0 &&
        normalizeSheetCell(rowValues[offset + 16]) === expectedAdminLink;

      if (hasExpectedAdminLink) {
        strictMatches.push(rowNumber);
      } else if (!options.requireAdminLink) {
        looseMatches.push(rowNumber);
      }
    }
  }

  return strictMatches.length > 0 ? strictMatches : looseMatches;
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
  const range = buildA1Range(worksheetTitle, "A1:S1");

  const headers = [
    "Статус",
    "Дата",
    "TG ID",
    "Username",
    "Тип",
    "Курс",
    "ПІБ укр",
    "ПІБ анг",
    "Місто / Адреса",
    "Відділення",
    "ПІБ отримувача",
    "Телефон отримувача",
    "Скріни",
    "Оцінка",
    "Відгук",
    "БПР (потрібне)",
    "Посилання на заявку (адмін)",
    "Статус",
    "Формат сертифіката",
  ] as const;

  // Delete extra columns beyond what we need (if present from old runs).
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId,sheets.properties.gridProperties.columnCount",
  });
  type WorksheetProperties = {
    title?: string;
    sheetId?: number | null;
    gridProperties?: { columnCount?: number | null };
  };

  const sheetProps = ((meta.data.sheets ?? []) as Array<{ properties?: WorksheetProperties }>)
    .map((sheet) => sheet.properties)
    .find((properties): properties is WorksheetProperties => properties?.title === worksheetTitle);
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

async function clearWorksheetRow(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  worksheetTitle: string,
  rowNumber: number,
): Promise<void> {
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: {
      ranges: [buildA1Range(worksheetTitle, `A${rowNumber}:ZZ${rowNumber}`)],
    },
  });
}

async function writeWorksheetRow(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  worksheetTitle: string,
  rowNumber: number,
  rowValues: (string | number)[],
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: buildA1Range(worksheetTitle, `A${rowNumber}:S${rowNumber}`),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowValues] },
  });
}

async function overwriteWorksheetRow(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  worksheetTitle: string,
  rowNumber: number,
  rowValues: (string | number)[],
): Promise<void> {
  await clearWorksheetRow(sheets, spreadsheetId, worksheetTitle, rowNumber);
  await writeWorksheetRow(sheets, spreadsheetId, worksheetTitle, rowNumber, rowValues);
}

/**
 * Upsert rows for all courses in an application: one sheet row per ApplicationCourse.
 *
 * Migration strategy for existing applications (Application.externalRowId set):
 *   - First course overwrites the legacy single row (replace strategy).
 *   - Additional courses are appended as new rows.
 *   - After all courses are processed, Application.externalRowId is nulled out
 *     (tracking moves to ApplicationCourse.externalRowId).
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
        orderBy: { createdAt: "asc" },
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
  const dataRange = buildA1Range(worksheetTitle, "A:S");

  const appForSync = application as unknown as ApplicationForSync & { externalRowId: number | null };
  const legacyRowId: number | null = appForSync.externalRowId;
  let lastRowId = 0;

  for (let i = 0; i < application.courses.length; i++) {
    const ac = application.courses[i] as unknown as ApplicationCourseForSync;
    const rowValues = applicationCourseToRowValues(appForSync, ac, adminApplicationUrl);

    // Determine the target row for this course entry.
    // Priority: ac.externalRowId → legacy Application.externalRowId (first course only) → append.
    let targetRowId: number | null = ac.externalRowId ?? null;
    if (targetRowId == null && i === 0 && legacyRowId != null) {
      targetRowId = legacyRowId;
    }
    if (targetRowId == null) {
      targetRowId = await findExistingRowNumberForCourse(
        sheets,
        spreadsheetId,
        worksheetTitle,
        appForSync,
        ac,
        adminApplicationUrl,
      );
    }

    if (targetRowId != null) {
      // Update the existing row and clear stale cells first. This repairs previously shifted rows.
      await overwriteWorksheetRow(sheets, spreadsheetId, worksheetTitle, targetRowId, rowValues);
      await overwriteDuplicateCourseRows(
        sheets,
        spreadsheetId,
        worksheetTitle,
        appForSync,
        ac,
        adminApplicationUrl,
        targetRowId,
        rowValues,
      );
      if (ac.externalRowId !== targetRowId) {
        await prisma.applicationCourse.update({
          where: { id: ac.id },
          data: { externalRowId: targetRowId },
        });
      }
      lastRowId = targetRowId;
    } else {
      // Append a new row.
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

      const parsedRange = parseUpdatedRange(updatedRange);
      if (!parsedRange) {
        throw new Error("Could not determine row number from append response");
      }
      const rowNumber = parsedRange.rowNumber;

      if (parsedRange.startColumn !== "A" || parsedRange.endColumn !== "S") {
        await overwriteWorksheetRow(sheets, spreadsheetId, worksheetTitle, rowNumber, rowValues);
      }

      try {
        await prisma.applicationCourse.update({
          where: { id: ac.id },
          data: { externalRowId: rowNumber },
        });
        lastRowId = rowNumber;
      } catch (err) {
        // Race condition: another concurrent sync wrote the same row index.
        // Resolve by scanning nearby rows for a matching entry.
        const resolvedRowNumber = await findRowNumberForApplication(
          sheets,
          spreadsheetId,
          worksheetTitle,
          appForSync,
          rowNumber,
        );
        if (!resolvedRowNumber) {
          throw err;
        }
        await prisma.applicationCourse.update({
          where: { id: ac.id },
          data: { externalRowId: resolvedRowNumber },
        });
        lastRowId = resolvedRowNumber;
      }
    }
  }

  // After migrating all courses, clear the legacy Application.externalRowId.
  if (legacyRowId != null) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { externalRowId: null },
    });
  }

  return { externalRowId: lastRowId };
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
    where: {
      status: "pending",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
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
    where: {
      status: "pending",
      schoolId,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
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
        nextAttemptAt: null,
      },
    });
    observability.increment("sync.processed.total");
    return true;
  } catch (err) {
    const message = getErrorMessage(err);
    const retryDelayMs = getGoogleSheetsRateLimitRetryDelayMs(err, attempt);
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
          nextAttemptAt: null,
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
          nextAttemptAt: retryDelayMs == null ? null : new Date(Date.now() + retryDelayMs),
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
  const expectedDate = formatSheetDate(application.createdAt);
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

function normalizeSheetCell(value: unknown): string {
  return String(value ?? "").trim();
}

async function findExistingRowNumberForCourse(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  worksheetTitle: string,
  application: ApplicationForSync & { createdAt: Date; telegramUserId: string },
  course: ApplicationCourseForSync,
  adminApplicationUrl: string | null,
): Promise<number | null> {
  const range = buildA1Range(worksheetTitle, "A2:ZZ");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const values = res.data.values ?? [];
  return findMatchingCourseRowNumbers(values, application, course, adminApplicationUrl)[0] ?? null;
}

async function overwriteDuplicateCourseRows(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  worksheetTitle: string,
  application: ApplicationForSync & { createdAt: Date; telegramUserId: string },
  course: ApplicationCourseForSync,
  adminApplicationUrl: string | null,
  targetRowId: number,
  rowValues: (string | number)[],
): Promise<void> {
  if (!adminApplicationUrl) return;

  const range = buildA1Range(worksheetTitle, "A2:ZZ");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const expectedAdminLink = toAdminApplicationHyperlink(adminApplicationUrl);
  if (!expectedAdminLink) return;

  const formulaRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: buildA1Range(worksheetTitle, "Q2:Q"),
    valueRenderOption: "FORMULA",
  });
  const formulaRows = formulaRes.data.values ?? [];

  const rowNumbers = findMatchingCourseRowNumbers(res.data.values ?? [], application, course, null)
    .filter((rowNumber) => normalizeSheetCell(formulaRows[rowNumber - 2]?.[0]) === expectedAdminLink);

  for (const rowNumber of rowNumbers) {
    if (rowNumber === targetRowId) continue;
    await overwriteWorksheetRow(sheets, spreadsheetId, worksheetTitle, rowNumber, rowValues);
  }
}
