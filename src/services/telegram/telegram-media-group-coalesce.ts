import type { TelegramIncoming } from "@/services/telegram/types";

/**
 * Час «тиші» після останнього фото альбому, перш ніж обробити один раз.
 * У деяких мережах/клієнтах update-и з одного альбому приходять повільніше,
 * тому збільшуємо вікно, щоб відповідь була саме "разом" для всіх фото.
 */
export const TELEGRAM_MEDIA_GROUP_COALESCE_MS = 1500;

type Bucket = {
  fileIds: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: Array<{ resolve: () => void; reject: (e: unknown) => void }>;
  latestIncoming: TelegramIncoming;
};

const buckets = new Map<string, Bucket>();

function bucketKey(schoolId: string, incoming: TelegramIncoming): string {
  if (incoming.mediaGroupId == null) {
    throw new Error("coalesceTelegramMediaGroup requires mediaGroupId");
  }
  return `${schoolId}:${incoming.chatId}:${incoming.mediaGroupId}`;
}

/**
 * Згадує file_id з одного media group і після паузи викликає flush один раз для всіх webhook-ів альбому.
 * На кількох інстансах serverless кожен апдейт може піти на різний воркер — тоді ефект частковий; на одному процесі дублікати прибирає.
 */
export function coalesceTelegramMediaGroup(
  schoolId: string,
  incoming: TelegramIncoming,
  screenshotFileId: string,
  flush: (args: { incoming: TelegramIncoming; fileIds: string[] }) => Promise<void>,
): Promise<void> {
  const key = bucketKey(schoolId, incoming);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      fileIds: new Set(),
      timer: null,
      waiters: [],
      latestIncoming: incoming,
    };
    buckets.set(key, bucket);
  }

  bucket.fileIds.add(screenshotFileId);
  bucket.latestIncoming = incoming;

  return new Promise((resolve, reject) => {
    bucket!.waiters.push({ resolve, reject });
    if (bucket!.timer != null) {
      clearTimeout(bucket!.timer);
    }
    bucket!.timer = setTimeout(() => {
      const entry = buckets.get(key);
      if (!entry) return;
      buckets.delete(key);
      const fileIds = [...entry.fileIds];
      const latest = entry.latestIncoming;
      const waiters = entry.waiters;
      void (async () => {
        try {
          await flush({ incoming: latest, fileIds });
          for (const w of waiters) w.resolve();
        } catch (e) {
          for (const w of waiters) w.reject(e);
        }
      })();
    }, TELEGRAM_MEDIA_GROUP_COALESCE_MS);
  });
}
