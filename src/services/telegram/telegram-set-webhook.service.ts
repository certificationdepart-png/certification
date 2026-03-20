import { env } from "@/lib/env";
import { apiRoutes } from "@/lib/api-routes";
import { logger } from "@/lib/logger";
import { AppError } from "@/services/errors";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalhostOrigin(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\/?$/i.test(url.trim());
}

/**
 * Public HTTPS origin (no path) used for Telegram setWebhook.
 * Prefer tunnel URL in dev; in production use NEXT_PUBLIC_APP_URL or VERCEL_URL.
 */
export function resolveTelegramWebhookPublicOrigin(): string | null {
  const tunnel = env.NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL?.trim();
  if (tunnel) {
    return stripTrailingSlash(tunnel);
  }

  // When running on Vercel in production, prefer the platform URL.
  // This prevents accidental usage of `NEXT_PUBLIC_APP_URL` values from
  // other environments (e.g. localhost) that might be set in Vercel.
  if (process.env.NODE_ENV === "production") {
    // `VERCEL_PROJECT_PRODUCTION_URL` is the canonical production domain, while
    // `VERCEL_URL` can point to preview deployments.
    const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    const vercelUrl = process.env.VERCEL_URL?.trim();
    const candidate = productionUrl ?? vercelUrl;

    if (candidate) {
      const host = candidate.replace(/^https?:\/\//i, "").split("/")[0] ?? "";
      if (host && !/^localhost|^127\./i.test(host)) {
        return stripTrailingSlash(`https://${host}`);
      }
    }
  }

  const app = env.NEXT_PUBLIC_APP_URL?.trim();
  if (app && !isLocalhostOrigin(app)) return stripTrailingSlash(app);
  return null;
}

type TelegramSetWebhookResponse = {
  ok?: boolean;
  description?: string;
};

/**
 * Calls Telegram setWebhook for this school’s bot so updates hit our shared webhook route.
 * Skipped in NODE_ENV=test to avoid external calls in tests.
 */
export async function registerSchoolBotWebhook(input: {
  botToken: string;
  schoolKey: string;
}): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    logger.info("telegram.set_webhook.skipped", { reason: "NODE_ENV=test" });
    return;
  }

  const origin = resolveTelegramWebhookPublicOrigin();
  if (!origin) {
    throw new AppError(
      "Немає публічної HTTPS-адреси додатку для Telegram webhook. Додайте у .env змінну NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL (наприклад ngrok) або виставте NEXT_PUBLIC_APP_URL на продакшн-домен без localhost.",
      400,
      "telegram_webhook_base_missing",
    );
  }

  const webhookUrl = `${origin}${apiRoutes.telegramWebhook}`;
  const body = new URLSearchParams({
    url: webhookUrl,
    secret_token: input.schoolKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${input.botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (e) {
    logger.warn("telegram.set_webhook.fetch_failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    throw new AppError(
      "Не вдалося звернутися до Telegram API (setWebhook). Перевірте мережу або спробуйте ще раз.",
      502,
      "telegram_set_webhook_fetch_failed",
    );
  } finally {
    clearTimeout(timeout);
  }

  let data: TelegramSetWebhookResponse;
  try {
    data = (await response.json()) as TelegramSetWebhookResponse;
  } catch {
    throw new AppError("Telegram API повернув не JSON на setWebhook", 502, "telegram_set_webhook_bad_response");
  }

  if (!data.ok) {
    logger.warn("telegram.set_webhook.rejected", {
      description: data.description,
      status: response.status,
    });
    throw new AppError(
      data.description ?? `Telegram відхилив setWebhook (HTTP ${response.status})`,
      502,
      "telegram_set_webhook_failed",
    );
  }

  logger.info("telegram.set_webhook.ok", {
    webhookUrl,
    schoolKeyMasked:
      input.schoolKey.length > 12
        ? `${input.schoolKey.slice(0, 5)}…${input.schoolKey.slice(-4)}`
        : "sk_***",
  });
}
