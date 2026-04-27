import "dotenv/config";

import { google } from "googleapis";
import { describe, expect, it } from "vitest";
import type { ApplicationCourseForSync, ApplicationForSync } from "@/services/google-sheets-sync.service";

const hasLocalGoogleSheetsEnv = Boolean(
  process.env.DATABASE_URL &&
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64),
);

try {
  const configuredUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (configuredUrl.protocol !== "https:" || configuredUrl.hostname === "localhost") {
    process.env.NEXT_PUBLIC_APP_URL = "https://local-sync-test.example";
  }
} catch {
  process.env.NEXT_PUBLIC_APP_URL = "https://local-sync-test.example";
}

type SheetsClient = ReturnType<typeof google.sheets>;

function parseGoogleCredentialsFromEnv() {
  const raw = (
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64
      ? Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64, "base64").toString("utf8")
      : process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ""
  ).trim();

  const candidates = [raw];
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    candidates.push(raw.slice(1, -1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as { client_email: string; private_key: string };
    } catch {
      // Try the next local-env representation.
    }
  }

  throw new Error("Local Google service account JSON is not valid");
}

function quoteSheetTitleForA1(sheetTitle: string, a1Range: string) {
  return `'${sheetTitle.replace(/'/g, "''")}'!${a1Range}`;
}

async function createSheetsClient(): Promise<SheetsClient> {
  const credentials = parseGoogleCredentialsFromEnv();
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function deleteWorksheetIfExists(
  sheets: SheetsClient,
  spreadsheetId: string,
  worksheetTitle: string,
) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId",
  });
  const sheet = meta.data.sheets?.find((item) => item.properties?.title === worksheetTitle);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId == null) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteSheet: { sheetId } }],
    },
  });
}

async function readSheetRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  worksheetTitle: string,
  rowNumber: number,
) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quoteSheetTitleForA1(worksheetTitle, `A${rowNumber}:S${rowNumber}`),
  });
  return res.data.values?.[0] ?? [];
}

async function countAdminLinkRows(
  sheets: SheetsClient,
  spreadsheetId: string,
  worksheetTitle: string,
  adminLinkFormula: string,
) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quoteSheetTitleForA1(worksheetTitle, "Q2:Q"),
    valueRenderOption: "FORMULA",
  });
  return (res.data.values ?? []).filter((row) => row?.[0] === adminLinkFormula).length;
}

function parseUpdatedRowNumber(updatedRange: string | null | undefined): number {
  const match = updatedRange?.match(/!([A-Z]+)(\d+)(?::([A-Z]+)\d+)?$/);
  if (!match) throw new Error(`Cannot parse updatedRange: ${updatedRange}`);
  return Number.parseInt(match[2], 10);
}

it.skipIf(!hasLocalGoogleSheetsEnv)(
  "syncs status changes to a real Google Sheet row without delayed stale rewrites",
  async () => {
    const { prisma } = await import("@/lib/db");
    const { resolvePublicAppBaseUrl } = await import("@/lib/app-url");
    const { routes } = await import("@/lib/routes");
    const { applicationCourseToRowValues, upsertApplicationRow } = await import("@/services/google-sheets-sync.service");

    const sheets = await createSheetsClient();
    const existingSchool = await prisma.school.findFirst({
      select: { googleSheetId: true },
      orderBy: { createdAt: "asc" },
    });
    const spreadsheetId = process.env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID ?? existingSchool?.googleSheetId;
    if (!spreadsheetId) {
      throw new Error("No local school googleSheetId and GOOGLE_SHEETS_TEST_SPREADSHEET_ID is not configured");
    }

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const worksheetTitle = `Codex Sync ${suffix}`;
    let schoolId: string | null = null;

    try {
      await deleteWorksheetIfExists(sheets, spreadsheetId, worksheetTitle);

      const school = await prisma.school.create({
        data: {
          name: worksheetTitle,
          slug: `codex-sync-${suffix}`,
          schoolKey: `codex-sync-key-${suffix}`,
          telegramChatId: `codex-chat-${suffix}`,
          telegramBotTokenEnc: "local-test-token",
          novaPoshtaApiKeyEnc: "local-test-nova-poshta",
          googleSheetId: spreadsheetId,
          googleSheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        },
      });
      schoolId = school.id;

      const course = await prisma.course.create({
        data: {
          schoolId: school.id,
          title: `Codex Course ${suffix}`,
          certificateType: "electronic",
          daysToSend: 7,
          requirementsText: "Local integration test course",
        },
      });

      const application = await prisma.application.create({
        data: {
          schoolId: school.id,
          telegramUserId: `tg-${suffix}`,
          telegramUsername: "codex_sync_test",
          chatId: `chat-${suffix}`,
          studentNameUa: "Тест Синхронізації",
          studentNameEn: "Sync Test",
          deliveryMode: "ua",
          deliveryCity: "Київ",
          deliveryBranch: "Відділення 1",
          recipientName: "Тест Синхронізації",
          recipientPhone: "+380501112233",
          status: "submitted",
          courses: {
            create: {
              courseId: course.id,
              certificateFormat: "electronic",
              bprRequired: false,
            },
          },
        },
      });

      const publicBaseUrl = resolvePublicAppBaseUrl();
      if (!publicBaseUrl) {
        throw new Error("NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL must resolve to a public HTTPS URL");
      }
      const adminUrl = `${publicBaseUrl}${routes.admin.applicationDetail(application.id)}`;
      const adminLinkFormula = `=HYPERLINK("${adminUrl.replace(/"/g, '""')}";"Відкрити")`;

      const firstSync = await upsertApplicationRow(school.id, application.id);
      const appCourseAfterFirstSync = await prisma.applicationCourse.findFirstOrThrow({
        where: { applicationId: application.id },
        include: { course: true },
      });
      expect(appCourseAfterFirstSync.externalRowId).toBe(firstSync.externalRowId);

      const submittedRow = await readSheetRow(sheets, spreadsheetId, worksheetTitle, firstSync.externalRowId);
      expect(submittedRow[0]).toBe("на перевірці");
      expect(submittedRow[17]).toBe("на перевірці");
      expect(await countAdminLinkRows(sheets, spreadsheetId, worksheetTitle, adminLinkFormula)).toBe(1);

      await prisma.application.update({
        where: { id: application.id },
        data: { status: "approved", managerCheckedAt: new Date() },
      });
      const approvedSync = await upsertApplicationRow(school.id, application.id);
      expect(approvedSync.externalRowId).toBe(firstSync.externalRowId);

      const approvedRow = await readSheetRow(sheets, spreadsheetId, worksheetTitle, firstSync.externalRowId);
      expect(approvedRow[0]).toBe("підтверджено");
      expect(approvedRow[17]).toBe("підтверджено");
      expect(await countAdminLinkRows(sheets, spreadsheetId, worksheetTitle, adminLinkFormula)).toBe(1);

      await prisma.application.update({
        where: { id: application.id },
        data: { status: "rejected" },
      });
      const rejectedSync = await upsertApplicationRow(school.id, application.id);
      expect(rejectedSync.externalRowId).toBe(firstSync.externalRowId);

      const rejectedRow = await readSheetRow(sheets, spreadsheetId, worksheetTitle, firstSync.externalRowId);
      expect(rejectedRow[0]).toBe("відхилено");
      expect(rejectedRow[17]).toBe("відхилено");
      expect(await countAdminLinkRows(sheets, spreadsheetId, worksheetTitle, adminLinkFormula)).toBe(1);

      const staleAppForDuplicate: ApplicationForSync = {
        courses: [],
        _count: { screenshots: 0 },
        createdAt: application.createdAt,
        deliveryMode: "ua",
        status: "submitted",
        telegramUserId: application.telegramUserId,
        telegramUsername: application.telegramUsername,
        studentNameUa: application.studentNameUa,
        studentNameEn: application.studentNameEn,
        deliveryCity: application.deliveryCity,
        deliveryBranch: application.deliveryBranch,
        deliveryAddress: application.deliveryAddress,
        deliveryCountry: application.deliveryCountry,
        deliveryPhone: application.deliveryPhone,
        deliveryEmail: application.deliveryEmail,
        recipientName: application.recipientName,
        recipientPhone: application.recipientPhone,
        score: application.score,
        feedbackText: application.feedbackText,
      };
      const courseForSync: ApplicationCourseForSync = {
        id: appCourseAfterFirstSync.id,
        externalRowId: appCourseAfterFirstSync.externalRowId,
        certificateFormat: appCourseAfterFirstSync.certificateFormat,
        bprRequired: appCourseAfterFirstSync.bprRequired,
        course: {
          title: appCourseAfterFirstSync.course.title,
          bprSpecialtyCheckLink: appCourseAfterFirstSync.course.bprSpecialtyCheckLink,
          bprTestLink: appCourseAfterFirstSync.course.bprTestLink,
        },
      };
      const staleDuplicateRow = applicationCourseToRowValues(staleAppForDuplicate, courseForSync, adminUrl);
      const appendDuplicate = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: quoteSheetTitleForA1(worksheetTitle, "A:S"),
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [staleDuplicateRow] },
      });
      const duplicateRowNumber = parseUpdatedRowNumber(appendDuplicate.data.updates?.updatedRange);
      expect(await countAdminLinkRows(sheets, spreadsheetId, worksheetTitle, adminLinkFormula)).toBe(2);

      await prisma.application.update({
        where: { id: application.id },
        data: { status: "approved", managerCheckedAt: new Date() },
      });
      const repairedSync = await upsertApplicationRow(school.id, application.id);
      expect(repairedSync.externalRowId).toBe(firstSync.externalRowId);

      const repairedTargetRow = await readSheetRow(sheets, spreadsheetId, worksheetTitle, firstSync.externalRowId);
      const repairedDuplicateRow = await readSheetRow(sheets, spreadsheetId, worksheetTitle, duplicateRowNumber);
      expect(repairedTargetRow[0]).toBe("підтверджено");
      expect(repairedTargetRow[17]).toBe("підтверджено");
      expect(repairedDuplicateRow[0]).toBe("підтверджено");
      expect(repairedDuplicateRow[17]).toBe("підтверджено");
      expect(await countAdminLinkRows(sheets, spreadsheetId, worksheetTitle, adminLinkFormula)).toBe(2);
    } finally {
      if (schoolId) {
        await prisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
      }
      await deleteWorksheetIfExists(sheets, spreadsheetId, worksheetTitle).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
  },
  60_000,
);

describe("Google Sheets live sync integration", () => {
  it("has local env available for live Google Sheets testing", () => {
    expect(hasLocalGoogleSheetsEnv).toBe(true);
  });
});
