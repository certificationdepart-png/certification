import type { ApplicationStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { upsertApplicationRow } from "@/services/google-sheets-sync.service";
import { NotFoundError } from "@/services/errors";
import { enqueueApplicationStatusChangedEvent } from "@/services/outbox.service";
import { sendConfirmationNotifications } from "@/services/telegram/telegram-notification.service";

export type ListApplicationsFilters = {
  schoolId?: string;
  status?: ApplicationStatus[];
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listApplications(filters: ListApplicationsFilters = {}) {
  const { schoolId, status, search, page = 1, pageSize = 20 } = filters;
  const skip = (page - 1) * pageSize;

  const where: Prisma.ApplicationWhereInput = {};
  if (schoolId) where.schoolId = schoolId;
  if (status?.length) where.status = { in: status };
  if (search?.trim()) {
    const term = search.trim();
    where.OR = [
      { studentNameUa: { contains: term, mode: "insensitive" } },
      { studentNameEn: { contains: term, mode: "insensitive" } },
      { telegramUsername: { contains: term, mode: "insensitive" } },
      { feedbackText: { contains: term, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        courses: {
          include: {
            course: { select: { title: true } },
          },
        },
        _count: { select: { screenshots: true } },
      },
    }),
    prisma.application.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
  };
}

export async function getApplicationById(id: string, schoolId?: string) {
  const where: Prisma.ApplicationWhereUniqueInput = { id };
  if (schoolId) (where as Prisma.ApplicationWhereInput).schoolId = schoolId;

  const application = await prisma.application.findFirst({
    where: where as Prisma.ApplicationWhereInput,
    include: {
      courses: {
        include: {
          course: {
            select: {
              id: true,
              title: true,
              daysToSend: true,
              bprSpecialtyCheckLink: true,
              bprTestLink: true,
            },
          },
        },
      },
      screenshots: { orderBy: { sortOrder: "asc" } },
      school: { select: { id: true, name: true, slug: true } },
      statusHistory: { orderBy: { changedAt: "desc" } },
    },
  });

  if (!application) {
    throw new NotFoundError("Заявку не знайдено");
  }

  return application;
}

export async function getApplicationScreenshot(
  applicationId: string,
  screenshotId: string,
  schoolId?: string,
) {
  const whereApp: Prisma.ApplicationWhereInput = { id: applicationId };
  if (schoolId) whereApp.schoolId = schoolId;

  const screenshot = await prisma.applicationScreenshot.findFirst({
    where: {
      id: screenshotId,
      application: whereApp,
    },
    include: {
      application: {
        include: {
          school: { select: { telegramBotTokenEnc: true } },
        },
      },
    },
  });

  if (!screenshot) {
    throw new NotFoundError("Скріншот не знайдено");
  }

  return screenshot;
}

export async function updateApplicationStatus(
  id: string,
  schoolId: string,
  newStatus: ApplicationStatus,
  userId?: string,
) {
  const existing = await prisma.application.findFirst({
    where: { id, schoolId },
    select: { id: true, status: true, schoolId: true },
  });

  if (!existing) {
    throw new NotFoundError("Заявку не знайдено");
  }

  const fromStatus = existing.status;
  const now = new Date();

  const updateData: Prisma.ApplicationUpdateInput = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === "approved") {
    updateData.managerCheckedAt = now;
  }

  const [application] = await prisma.$transaction([
    prisma.application.update({
      where: { id },
      data: updateData,
      include: {
        courses: {
          include: { course: { select: { title: true, daysToSend: true } } },
        },
        screenshots: true,
        school: true,
      },
    }),
    prisma.applicationStatusHistory.create({
      data: {
        applicationId: id,
        fromStatus,
        toStatus: newStatus,
        changedByUserId: userId ?? null,
      },
    }),
  ]);

  await enqueueApplicationStatusChangedEvent({
    applicationId: id,
    schoolId,
    newStatus,
  });

  // Real-time best-effort Sheets update for admin-driven status changes.
  // If Google credentials are missing or Sheets update fails, we rely on the queued sync job.
  try {
    await upsertApplicationRow(schoolId, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Realtime Google Sheets upsert failed (best-effort)", { applicationId: id, schoolId, message });
  }

  /** Не покладатися лише на outbox/cron: work-scope — підтвердження користувачу одразу після дії менеджера. */
  if (newStatus === "approved") {
    await sendConfirmationNotifications(id);
  }

  return application;
}

export type ChatHistoryEntry = {
  id: string;
  createdAt: Date;
  direction: "user" | "bot";
  contentType: "text" | "photo" | "callback";
  content: string;
};

function parseTelegramPayloadToContent(payload: unknown): { contentType: "text" | "photo" | "callback"; content: string } {
  if (!payload || typeof payload !== "object") {
    return { contentType: "text", content: "—" };
  }
  const p = payload as Record<string, unknown>;
  if (p.callback_query && typeof p.callback_query === "object") {
    const cq = p.callback_query as Record<string, unknown>;
    const data = (cq.data as string) || "";

    // Telegram callback queries typically include the inline keyboard in `message.reply_markup`.
    // If we can find the pressed button by matching `callback_data`, we can show the real button text.
    // Fallback: show callback_data as before.
    const message = cq.message && typeof cq.message === "object" ? (cq.message as Record<string, unknown>) : null;
    const replyMarkup =
      message?.reply_markup && typeof message.reply_markup === "object"
        ? (message.reply_markup as Record<string, unknown>)
        : null;

    const inlineKeyboard = Array.isArray(replyMarkup?.inline_keyboard) ? (replyMarkup?.inline_keyboard as unknown[]) : null;

    if (data && inlineKeyboard) {
      for (const row of inlineKeyboard) {
        if (!Array.isArray(row)) continue;
        for (const btn of row) {
          if (!btn || typeof btn !== "object") continue;
          const b = btn as Record<string, unknown>;
          if (String(b.callback_data ?? "") !== data) continue;
          const text = typeof b.text === "string" ? b.text.trim() : "";
          if (text) {
            return { contentType: "callback", content: text };
          }
        }
      }
    }

    return { contentType: "callback", content: data ? `[Натиснуто: ${data}]` : "[Callback]" };
  }
  if (p.message && typeof p.message === "object") {
    const msg = p.message as Record<string, unknown>;
    const text = (msg.text as string)?.trim();
    const photo = msg.photo;
    const caption = (msg.caption as string)?.trim();
    if (photo && Array.isArray(photo)) {
      return { contentType: "photo", content: caption || "[Фото]" };
    }
    const doc = msg.document as { file_name?: string } | undefined;
    if (doc && typeof doc === "object" && "file_id" in doc) {
      const name = doc.file_name?.trim();
      return {
        contentType: "photo",
        content: caption || (name ? `[Файл: ${name}]` : "[Файл / документ]"),
      };
    }
    return { contentType: "text", content: text || caption || "—" };
  }
  return { contentType: "text", content: "—" };
}

export async function getApplicationChatHistory(applicationId: string): Promise<ChatHistoryEntry[]> {
  const application = await prisma.application.findFirst({
    where: { id: applicationId },
    select: { schoolId: true, chatId: true, telegramUserId: true },
  });
  if (!application) {
    throw new NotFoundError("Заявку не знайдено");
  }

  const [updates, outgoing] = await Promise.all([
    prisma.telegramUpdateLog.findMany({
      where: {
        schoolId: application.schoolId,
        OR: [
          { chatId: application.chatId },
          { telegramUserId: application.telegramUserId },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, payload: true, updateType: true },
    }),
    prisma.outgoingMessageLog
      ? prisma.outgoingMessageLog.findMany({
          where: {
            schoolId: application.schoolId,
            chatId: application.chatId,
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, createdAt: true, text: true },
        })
      : Promise.resolve([]),
  ]);

  const userEntries: ChatHistoryEntry[] = updates.map((u) => {
    const { contentType, content } = parseTelegramPayloadToContent(u.payload);
    return {
      id: `user-${u.id}`,
      createdAt: u.createdAt,
      direction: "user" as const,
      contentType,
      content,
    };
  });
  const botEntries: ChatHistoryEntry[] = outgoing.map((o) => ({
    id: `bot-${o.id}`,
    createdAt: o.createdAt,
    direction: "bot" as const,
    contentType: "text" as const,
    content: o.text,
  }));

  const merged = [...userEntries, ...botEntries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return merged;
}
