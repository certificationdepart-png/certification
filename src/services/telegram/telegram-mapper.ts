import { z } from "zod";

import type { TelegramIncoming, TelegramUpdate } from "@/services/telegram/types";

const telegramUpdateSchema = z.object({
  // Telegram sometimes serializes numeric fields as strings.
  // Coerce to be resilient to multi-photo/media_group payloads.
  // update_id may exceed JS safe integer range; use bigint.
  update_id: z.coerce.bigint().nonnegative(),
  message: z
    .object({
      message_id: z.coerce.number(),
      // Telegram Bot API docs: media_group_id is a String.
      media_group_id: z.string().optional(),
      text: z.string().optional(),
      chat: z.object({
        id: z.coerce.number(),
        type: z.string(),
      }),
      from: z
        .object({
          id: z.coerce.number(),
          username: z.string().optional(),
        })
        .optional(),
      photo: z
        .array(
          z.object({
            file_id: z.string().min(1),
            file_unique_id: z.string(),
            // Not used by the app; Telegram may omit these in some payloads.
            width: z.coerce.number().optional(),
            height: z.coerce.number().optional(),
            file_size: z.coerce.number().optional(),
          }),
        )
        .optional(),
      document: z
        .object({
          file_id: z.string().min(1),
          file_name: z.string().optional(),
          mime_type: z.string().optional(),
        })
        .optional(),
      video: z
        .object({
          file_id: z.string().min(1),
          file_unique_id: z.string().optional(),
        })
        .optional(),
      animation: z
        .object({
          file_id: z.string().min(1),
          file_unique_id: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      from: z.object({
        id: z.coerce.number(),
        username: z.string().optional(),
      }),
      message: z
        .object({
          message_id: z.coerce.number(),
          chat: z.object({
            id: z.coerce.number(),
            type: z.string(),
          }),
        })
        .optional(),
    })
    .optional(),
});

/** Підставляє `message` з `edited_message` — інакше правки тексту в Telegram дають апдейт без `message`. */
function normalizeTelegramPayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") {
    return payload;
  }
  const p = payload as Record<string, unknown>;
  if (!p.message && p.edited_message && typeof p.edited_message === "object") {
    return { ...p, message: p.edited_message };
  }
  return payload;
}

/**
 * Розбір апдейта. Повертає `null`, якщо це службовий тип (channel_post, poll тощо) — їх обробляти не потрібно.
 */
export function parseTelegramUpdate(payload: unknown): TelegramUpdate | null {
  const normalized = normalizeTelegramPayload(payload);
  const parsed = telegramUpdateSchema.parse(normalized);
  if (!parsed.message && !parsed.callback_query) {
    return null;
  }
  return parsed;
}

export function mapIncomingUpdate(update: TelegramUpdate): TelegramIncoming {
  if (update.callback_query) {
    const chatId = String(update.callback_query.message?.chat.id ?? "");
    if (!chatId) {
      throw new Error("Callback query is missing chat id");
    }
    return {
    updateId: update.update_id,
      chatId,
      telegramUserId: String(update.callback_query.from.id),
      telegramUsername: update.callback_query.from.username ?? null,
      text: null,
      callbackData: update.callback_query.data ?? null,
      callbackMessageId: update.callback_query.message?.message_id ?? null,
      screenshotFileId: null,
      mediaGroupId: null,
      updateType: "callback_query",
      raw: update,
    };
  }

  const message = update.message;
  if (!message) {
    throw new Error("Message payload is required");
  }
  const screenshotFileId =
    message.photo?.length && message.photo.length > 0
      ? message.photo[message.photo.length - 1]!.file_id
      : (message.document?.file_id ?? message.video?.file_id ?? message.animation?.file_id ?? null);
  const mediaGroupId = message.media_group_id ?? null;

  return {
    updateId: update.update_id,
    chatId: String(message.chat.id),
    telegramUserId: String(message.from?.id ?? message.chat.id),
    telegramUsername: message.from?.username ?? null,
    text: message.text?.trim() || null,
    callbackData: null,
    callbackMessageId: null,
    screenshotFileId,
    mediaGroupId,
    updateType: "message",
    raw: update,
  };
}

