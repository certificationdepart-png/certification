import { prisma } from "@/lib/db";
import { createTelegramClient } from "@/services/telegram/telegram-client";
import type { TelegramClient } from "@/services/telegram/telegram-client";

export function createTelegramClientWithLogging(
  schoolId: string,
  baseClient: TelegramClient = createTelegramClient(),
): TelegramClient {
  return {
    async sendMessage(input) {
      await baseClient.sendMessage(input);
      await prisma.outgoingMessageLog.create({
        data: {
          schoolId,
          chatId: input.chatId,
          text: input.text,
        },
      });
    },
    async deleteMessage(input) {
      await baseClient.deleteMessage(input);
    },
    async sendPhoto(input) {
      await baseClient.sendPhoto(input);
      await prisma.outgoingMessageLog.create({
        data: {
          schoolId,
          chatId: input.chatId,
          text: input.caption?.trim() || "[Фото]",
        },
      });
    },
    async sendDocument(input) {
      await baseClient.sendDocument(input);
      await prisma.outgoingMessageLog.create({
        data: {
          schoolId,
          chatId: input.chatId,
          text: input.caption?.trim() || "[Документ]",
        },
      });
    },
    async sendMediaGroup(input) {
      await baseClient.sendMediaGroup(input);
      const captions = input.media
        .map((m) => m.caption?.trim())
        .filter((x): x is string => Boolean(x));

      const text =
        captions.length > 0 ? captions.join("\n") : `[Медіа-група: ${input.media.length}]`;

      await prisma.outgoingMessageLog.create({
        data: {
          schoolId,
          chatId: input.chatId,
          text,
        },
      });
    },
  };
}
