import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { handleRouteError } from "@/lib/api-response";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { observability } from "@/lib/observability";
import { applyRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { handleTelegramWebhook } from "@/services/telegram/telegram-webhook.service";
import { apiRoutes } from "@/lib/api-routes";
import { AppError } from "@/services/errors";

function maskSchoolKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 12) return "sk_***";
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}

function resolveSchoolKey(request: Request): string | null {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (secretHeader) {
    return secretHeader;
  }
  const schoolKey = new URL(request.url).searchParams.get("schoolKey");
  if (schoolKey) {
    return schoolKey;
  }
  return null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    observability.increment("webhook.requests.total");
    const fingerprint = getRequestFingerprint(request);
    const rateLimit = applyRateLimit({
      key: `telegram:webhook:${fingerprint}`,
      limit: env.RATE_LIMIT_WEBHOOK_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      logger.warn("Rate limit exceeded for telegram webhook", {
        fingerprint,
        route: apiRoutes.telegramWebhook,
      });
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
          },
        },
      );
    }

    const payload: unknown = await request.json();
    const schoolKey = resolveSchoolKey(request);
    const updateId =
      typeof payload === "object" && payload !== null && "update_id" in payload
        ? (payload as { update_id?: unknown }).update_id
        : undefined;
    logger.info("telegram_webhook.received", {
      schoolKeyMasked: maskSchoolKey(schoolKey),
      schoolKeySource: request.headers.get("x-telegram-bot-api-secret-token") ? "header" : schoolKey ? "query" : "none",
      updateId,
      fingerprint,
    });
    const result = await handleTelegramWebhook({ schoolKey, payload });
    logger.info("telegram_webhook.handled", {
      schoolKeyMasked: maskSchoolKey(schoolKey),
      updateId,
      duplicate: result.duplicate === true,
      durationMs: Date.now() - startedAt,
    });
    observability.observe("webhook.latency.ms", Date.now() - startedAt);
    return NextResponse.json(result);
  } catch (error) {
    observability.increment("webhook.errors.total");
    observability.observe("webhook.latency.ms", Date.now() - startedAt);
    if (error instanceof AppError) {
      logger.warn("telegram_webhook.app_error", {
        code: error.code,
        status: error.status,
        message: error.message,
      });
    } else if (error instanceof ZodError) {
      logger.warn("telegram_webhook.payload_validation", {
        issueCount: error.issues.length,
        firstIssue: error.issues[0]?.message,
        firstIssuePath: error.issues[0]?.path?.join("."),
        firstIssueCode: error.issues[0]?.code,
      });
      // Telegram retries webhooks on non-2xx responses.
      // If payload validation fails, retrying is unlikely to succeed and can create
      // "stuck" behavior (repeated failed attempts for the same update).
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    } else {
      logger.error("telegram_webhook.unexpected_error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return handleRouteError(error);
  }
}

