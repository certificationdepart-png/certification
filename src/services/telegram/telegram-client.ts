import { logger } from "@/lib/logger";

/** Inline button: either opens a URL or sends callback_data (mutually exclusive in Bot API). */
export type TelegramInlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type SendMessageInput = {
  botToken: string;
  chatId: string;
  text: string;
  /** Telegram parse mode, e.g. "Markdown" or "HTML". */
  parseMode?: string;
  replyMarkup?: {
    inline_keyboard: TelegramInlineKeyboardButton[][];
  };
};

export type DeleteMessageInput = {
  botToken: string;
  chatId: string;
  messageId: number;
};

export type SendPhotoInput = {
  botToken: string;
  chatId: string;
  /** `file_id` або URL */
  photo: string;
  /** До 1024 символів */
  caption?: string;
};

export type SendMediaGroupPhotoInput = {
  type: "photo";
  media: string;
  caption?: string;
};

export type SendMediaGroupInput = {
  botToken: string;
  chatId: string;
  /** 2–10 елементів (обмеження Bot API). */
  media: SendMediaGroupPhotoInput[];
};

export type SendDocumentInput = {
  botToken: string;
  chatId: string;
  /** `file_id` або URL (HTTPS до api.telegram.org/file/…). */
  document: string;
  caption?: string;
};

export type TelegramClient = {
  sendMessage: (input: SendMessageInput) => Promise<void>;
  /** Не кидає помилку при 4xx (повідомлення вже видалено, термін минув тощо). */
  deleteMessage: (input: DeleteMessageInput) => Promise<void>;
  sendPhoto: (input: SendPhotoInput) => Promise<void>;
  sendDocument: (input: SendDocumentInput) => Promise<void>;
  sendMediaGroup: (input: SendMediaGroupInput) => Promise<void>;
};

/** HTTPS-посилання на файл на серверах Telegram (для повторної відправки в канал). */
export async function fetchTelegramFileUrl(
  fetchImpl: typeof fetch,
  botToken: string,
  fileId: string,
): Promise<string | null> {
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const raw: unknown = await response.json().catch(() => null);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { ok?: boolean; result?: { file_path?: string } };
  if (!r.ok || typeof r.result?.file_path !== "string") return null;
  return `https://api.telegram.org/file/bot${botToken}/${r.result.file_path}`;
}

/**
 * Доказ з діалогу (photo або document file_id): фото → документ → завантаження через getFile.
 * Не кидає після вичерпання спроб — лише логує.
 */
export async function sendChatProofWithFallbacks(
  client: Pick<TelegramClient, "sendPhoto" | "sendDocument">,
  fetchImpl: typeof fetch,
  input: { botToken: string; chatId: string; fileId: string; caption?: string },
): Promise<void> {
  const cap =
    input.caption != null && input.caption !== "" ? input.caption.slice(0, 1024) : undefined;
  const base = { botToken: input.botToken, chatId: input.chatId };

  try {
    await client.sendPhoto({ ...base, photo: input.fileId, caption: cap });
    return;
  } catch (e) {
    logger.warn("telegram.proof_send_photo_file_id", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  try {
    await client.sendDocument({ ...base, document: input.fileId, caption: cap });
    return;
  } catch (e) {
    logger.warn("telegram.proof_send_document_file_id", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const url = await fetchTelegramFileUrl(fetchImpl, input.botToken, input.fileId);
  if (!url) {
    logger.warn("telegram.proof_get_file_failed", { fileIdSuffix: input.fileId.slice(-12) });
    return;
  }
  try {
    await client.sendPhoto({ ...base, photo: url, caption: cap });
    return;
  } catch (e) {
    logger.warn("telegram.proof_send_photo_url", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  try {
    await client.sendDocument({ ...base, document: url, caption: cap });
  } catch (e) {
    logger.error("telegram.proof_send_all_failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
};

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 150,
};

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /Telegram API error: (429|5\d\d)/.test(error.message) || error.message.includes("fetch");
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_RETRY.maxAttempts;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs;
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetriableError(error)) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

export function createTelegramClient(fetchImpl: typeof fetch = fetch): TelegramClient {
  return {
    async sendMessage(input) {
      await retryWithBackoff(async () => {
        const response = await fetchImpl(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
          ...(input.replyMarkup && { reply_markup: input.replyMarkup }),
        }),
        });
        if (!response.ok) {
          const detail = await response.text();
          logger.warn("telegram.send_message_http_error", {
            status: response.status,
            chatIdSuffix: input.chatId.length > 4 ? `…${input.chatId.slice(-4)}` : input.chatId,
            detailPreview: detail.slice(0, 300),
          });
          throw new Error(`Telegram API error: ${response.status}`);
        }
      });
    },
    async deleteMessage(input) {
      try {
        const response = await fetchImpl(`https://api.telegram.org/bot${input.botToken}/deleteMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: input.chatId,
            message_id: input.messageId,
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          logger.warn("telegram.delete_message_http_error", {
            status: response.status,
            messageId: input.messageId,
            detailPreview: detail.slice(0, 200),
          });
        }
      } catch (err) {
        logger.warn("telegram.delete_message_failed", {
          message: err instanceof Error ? err.message : String(err),
          messageId: input.messageId,
        });
      }
    },
    async sendPhoto(input) {
      await retryWithBackoff(async () => {
        const response = await fetchImpl(`https://api.telegram.org/bot${input.botToken}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: input.chatId,
            photo: input.photo,
            ...(input.caption != null && input.caption !== ""
              ? { caption: input.caption.slice(0, 1024) }
              : {}),
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          logger.warn("telegram.send_photo_http_error", {
            status: response.status,
            detailPreview: detail.slice(0, 300),
          });
          throw new Error(`Telegram API error: ${response.status}`);
        }
      });
    },
    async sendDocument(input) {
      await retryWithBackoff(async () => {
        const response = await fetchImpl(`https://api.telegram.org/bot${input.botToken}/sendDocument`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: input.chatId,
            document: input.document,
            ...(input.caption != null && input.caption !== ""
              ? { caption: input.caption.slice(0, 1024) }
              : {}),
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          logger.warn("telegram.send_document_http_error", {
            status: response.status,
            detailPreview: detail.slice(0, 300),
          });
          throw new Error(`Telegram API error: ${response.status}`);
        }
      });
    },
    async sendMediaGroup(input) {
      if (input.media.length < 2 || input.media.length > 10) {
        throw new Error(`sendMediaGroup expects 2–10 items, got ${input.media.length}`);
      }
      await retryWithBackoff(async () => {
        const response = await fetchImpl(
          `https://api.telegram.org/bot${input.botToken}/sendMediaGroup`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: input.chatId,
              media: input.media.map((m) => ({
                type: m.type,
                media: m.media,
                ...(m.caption != null && m.caption !== ""
                  ? { caption: m.caption.slice(0, 1024) }
                  : {}),
              })),
            }),
          },
        );
        if (!response.ok) {
          const detail = await response.text();
          logger.warn("telegram.send_media_group_http_error", {
            status: response.status,
            detailPreview: detail.slice(0, 300),
          });
          throw new Error(`Telegram API error: ${response.status}`);
        }
      });
    },
  };
}

