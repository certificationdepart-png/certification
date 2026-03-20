import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { parseGoogleSpreadsheetIdFromUrl } from "@/lib/google-spreadsheet";
import { prisma } from "@/lib/db";
import { slugifySchoolName } from "@/lib/school-slug";
import { AppError, NotFoundError } from "@/services/errors";
import {
  type SchoolCreateInput,
  type SchoolUpdateInput,
  schoolCreateSchema,
  schoolUpdateSchema,
} from "@/services/validation";
import { registerSchoolBotWebhook } from "@/services/telegram/telegram-set-webhook.service";

function mapSchoolPublic(school: {
  id: string;
  name: string;
  slug: string;
  schoolKey: string;
  telegramChatId: string;
  googleSheetId: string;
  googleSheetUrl: string | null;
  secretEncryptionKeyVer: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...school,
    hasTelegramBotToken: true,
    hasNovaPoshtaApiKey: true,
  };
}

function mapPrismaError(error: unknown): never {
  if ((error as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
    throw new AppError("Порушено обмеження унікальності", 409, "unique_violation");
  }
  if (error instanceof ZodError) {
    throw new AppError(error.issues.map((i) => i.message).join("; "), 400, "validation_error");
  }
  throw error;
}

async function allocateUniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 0;
  const maxAttempts = 100;
  while (n < maxAttempts) {
    const existing = await prisma.school.findUnique({ where: { slug: candidate } });
    if (!existing) {
      return candidate;
    }
    n += 1;
    candidate = `${base}-${n}`;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

async function allocateUniqueSchoolKey(): Promise<string> {
  for (let i = 0; i < 32; i += 1) {
    const schoolKey = `sk_${randomBytes(16).toString("hex")}`;
    const existing = await prisma.school.findUnique({ where: { schoolKey } });
    if (!existing) {
      return schoolKey;
    }
  }
  throw new AppError("Не вдалося згенерувати унікальний ключ школи", 500, "key_generation_failed");
}

export async function listSchools() {
  const schools = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      schoolKey: true,
      telegramChatId: true,
      googleSheetId: true,
      googleSheetUrl: true,
      secretEncryptionKeyVer: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return schools.map(mapSchoolPublic);
}

const emptySyncStats = () => ({
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
});

async function syncJobStatsBySchoolId(): Promise<
  Map<string, ReturnType<typeof emptySyncStats>>
> {
  const rows = await prisma.syncJob.groupBy({
    by: ["schoolId", "status"],
    _count: true,
  });
  const map = new Map<string, ReturnType<typeof emptySyncStats>>();
  for (const row of rows) {
    let cur = map.get(row.schoolId);
    if (!cur) {
      cur = emptySyncStats();
      map.set(row.schoolId, cur);
    }
    const n = row._count;
    if (row.status === "pending") cur.pending += n;
    else if (row.status === "processing") cur.processing += n;
    else if (row.status === "completed") cur.completed += n;
    else if (row.status === "failed") cur.failed += n;
  }
  return map;
}

/** Schools list with aggregated Google Sheets sync queue counts per school (admin table). */
export async function listSchoolsWithSyncStats() {
  const schools = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      schoolKey: true,
      telegramChatId: true,
      googleSheetId: true,
      googleSheetUrl: true,
      secretEncryptionKeyVer: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const statsMap = await syncJobStatsBySchoolId();
  return schools.map((school) => ({
    ...mapSchoolPublic(school),
    syncStats: statsMap.get(school.id) ?? emptySyncStats(),
  }));
}

export async function getSchoolById(id: string) {
  const school = await prisma.school.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      schoolKey: true,
      telegramChatId: true,
      googleSheetId: true,
      googleSheetUrl: true,
      secretEncryptionKeyVer: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!school) {
    throw new NotFoundError("Школу не знайдено");
  }
  return mapSchoolPublic(school);
}

export async function createSchool(input: SchoolCreateInput) {
  try {
    const parsed = schoolCreateSchema.parse(input);
    const googleSheetId = parseGoogleSpreadsheetIdFromUrl(parsed.googleSheetUrl);
    if (!googleSheetId) {
      throw new AppError("Невалідне посилання на Google Таблицю", 400, "invalid_sheet_url");
    }
    const slug = await allocateUniqueSlug(slugifySchoolName(parsed.name));
    const schoolKey = await allocateUniqueSchoolKey();
    const school = await prisma.school.create({
      data: {
        name: parsed.name,
        slug,
        schoolKey,
        telegramChatId: parsed.telegramChatId,
        telegramBotTokenEnc: encryptSecret(parsed.telegramBotToken),
        novaPoshtaApiKeyEnc: encryptSecret(parsed.novaPoshtaApiKey),
        googleSheetId,
        googleSheetUrl: parsed.googleSheetUrl.trim(),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        schoolKey: true,
        telegramChatId: true,
        googleSheetId: true,
        googleSheetUrl: true,
        secretEncryptionKeyVer: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await registerSchoolBotWebhook({
      botToken: parsed.telegramBotToken,
      schoolKey: school.schoolKey,
    });
    logger.info("school.telegram_bot_token_saved", { schoolId: school.id, setWebhook: true });
    return mapSchoolPublic(school);
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function updateSchool(id: string, input: SchoolUpdateInput) {
  try {
    const parsed = schoolUpdateSchema.parse(input);

    if (parsed.telegramBotToken !== undefined) {
      const existing = await prisma.school.findUnique({
        where: { id },
        select: { schoolKey: true },
      });
      if (!existing) {
        throw new NotFoundError("Школу не знайдено");
      }
      await registerSchoolBotWebhook({
        botToken: parsed.telegramBotToken,
        schoolKey: existing.schoolKey,
      });
    }

    const data: Prisma.SchoolUpdateInput = {
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.telegramChatId !== undefined ? { telegramChatId: parsed.telegramChatId } : {}),
      ...(parsed.telegramBotToken !== undefined
        ? { telegramBotTokenEnc: encryptSecret(parsed.telegramBotToken) }
        : {}),
      ...(parsed.novaPoshtaApiKey !== undefined
        ? { novaPoshtaApiKeyEnc: encryptSecret(parsed.novaPoshtaApiKey) }
        : {}),
    };
    if (parsed.googleSheetUrl !== undefined && parsed.googleSheetUrl !== "") {
      const googleSheetId = parseGoogleSpreadsheetIdFromUrl(parsed.googleSheetUrl);
      if (!googleSheetId) {
        throw new AppError("Невалідне посилання на Google Таблицю", 400, "invalid_sheet_url");
      }
      data.googleSheetId = googleSheetId;
      data.googleSheetUrl = parsed.googleSheetUrl.trim();
    }
    const school = await prisma.school.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        schoolKey: true,
        telegramChatId: true,
        googleSheetId: true,
        googleSheetUrl: true,
        secretEncryptionKeyVer: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (parsed.telegramBotToken !== undefined) {
      logger.info("school.telegram_bot_token_saved", { schoolId: school.id, setWebhook: true });
    }
    return mapSchoolPublic(school);
  } catch (error) {
    if ((error as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("Школу не знайдено");
    }
    mapPrismaError(error);
  }
}

export async function deleteSchool(id: string) {
  try {
    await prisma.school.delete({ where: { id } });
    return { ok: true };
  } catch (error) {
    if ((error as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("Школу не знайдено");
    }
    mapPrismaError(error);
  }
}

export async function revealSchoolCredentials(id: string) {
  const school = await prisma.school.findUnique({
    where: { id },
    select: {
      telegramBotTokenEnc: true,
      novaPoshtaApiKeyEnc: true,
    },
  });
  if (!school) {
    throw new NotFoundError("Школу не знайдено");
  }
  return {
    telegramBotToken: decryptSecret(school.telegramBotTokenEnc),
    novaPoshtaApiKey: decryptSecret(school.novaPoshtaApiKeyEnc),
  };
}

export async function getSchoolWebhookContext(schoolKey: string) {
  const school = await prisma.school.findUnique({
    where: { schoolKey },
    select: {
      id: true,
      schoolKey: true,
      telegramChatId: true,
      telegramBotTokenEnc: true,
    },
  });
  if (!school) {
    throw new NotFoundError("Школу не знайдено");
  }
  return {
    id: school.id,
    schoolKey: school.schoolKey,
    telegramChatId: school.telegramChatId,
    telegramBotToken: decryptSecret(school.telegramBotTokenEnc),
  };
}
