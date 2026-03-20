import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AppError } from "@/services/errors";
import { getSchoolWebhookContext } from "@/services/schools.service";
import type { TelegramClient } from "@/services/telegram/telegram-client";
import { createTelegramClientWithLogging } from "@/services/telegram/telegram-client-with-logging";
import { coalesceTelegramMediaGroup } from "@/services/telegram/telegram-media-group-coalesce";
import { processTelegramDialog } from "@/services/telegram/telegram-dialog.service";
import { registerIncomingUpdate } from "@/services/telegram/telegram-idempotency.service";
import { mapIncomingUpdate, parseTelegramUpdate } from "@/services/telegram/telegram-mapper";

type HandleWebhookInput = {
  schoolKey: string | null;
  payload: unknown;
  telegramClient?: TelegramClient;
};

export async function handleTelegramWebhook(input: HandleWebhookInput) {
  if (!input.schoolKey) {
    logger.warn("telegram_webhook.reject_missing_school_key", {
      hint: "Use setWebhook with secret_token or ?schoolKey= matching the school schoolKey",
    });
    throw new AppError("Параметр schoolKey є обов'язковим", 400, "missing_school_key");
  }

  const school = await getSchoolWebhookContext(input.schoolKey);
  const update = parseTelegramUpdate(input.payload);
  if (!update) {
    const extraKeys =
      input.payload !== null && typeof input.payload === "object"
        ? Object.keys(input.payload as object).filter((k) => k !== "update_id")
        : [];
    logger.info("telegram_webhook.ignored_update", {
      schoolId: school.id,
      extraKeys,
    });
    return {
      ok: true,
      ignored: true,
    };
  }
  const incoming = mapIncomingUpdate(update);
  logger.info("telegram_webhook.processing_update", {
    schoolId: school.id,
    updateId: String(incoming.updateId),
    updateType: incoming.updateType,
    chatIdSuffix: incoming.chatId.length > 4 ? `…${incoming.chatId.slice(-4)}` : incoming.chatId,
  });
  const idempotency = await registerIncomingUpdate({
    schoolId: school.id,
    updateId: incoming.updateId,
    chatId: incoming.chatId,
    telegramUserId: incoming.telegramUserId,
    updateType: incoming.updateType,
    payload: incoming.raw,
  });

  if (idempotency.isDuplicate) {
    logger.info("telegram_webhook.duplicate_update", {
      schoolId: school.id,
      updateId: String(incoming.updateId),
    });
    return {
      ok: true,
      duplicate: true,
    };
  }

  const client = input.telegramClient ?? createTelegramClientWithLogging(school.id);
  const albumFileId =
    incoming.updateType === "message" &&
    incoming.mediaGroupId != null &&
    incoming.screenshotFileId != null
      ? incoming.screenshotFileId
      : null;

  try {
    if (albumFileId != null) {
      await coalesceTelegramMediaGroup(school.id, incoming, albumFileId, async ({ incoming: last, fileIds }) => {
        await processTelegramDialog({
          school,
          incoming: {
            ...last,
            screenshotFileId: null,
            batchedScreenshotFileIds: fileIds,
          },
          telegramClient: client,
        });
      });
    } else {
      await processTelegramDialog({
        school,
        incoming,
        telegramClient: client,
      });
    }
  } catch (error) {
    /** Після збою Telegram повторює той самий update_id; інакше запис у логу блокує повторну обробку (duplicate). */
    await prisma.telegramUpdateLog.deleteMany({
      where: { schoolId: school.id, updateId: incoming.updateId },
    });
    throw error;
  }

  return {
    ok: true,
    duplicate: false,
  };
}

