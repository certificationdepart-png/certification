import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Separate dispatcher for certificate follow-ups. Never shares the legacy Outbox
 * runner, which handles status updates / Google Sheets synchronization.
 *
 * Each claim uses a Postgres row lock (SKIP LOCKED) so overlapping invocations
 * cannot claim the same event. Stuck `processing` and `needs_review` are NEVER
 * auto-retried: after an ambiguous Telegram response, retrying may duplicate a
 * message that was already delivered. Resolve those manually.
 */

type ClaimedEvent = {
  id: string;
  schoolId: string;
  applicationId: string | null;
  payload: unknown;
  attemptCount: number;
};

type FollowupPayload = {
  applicationId: string;
  schoolId: string;
  courseId: string;
  chatId: string;
  messageText: string;
};

export function isFollowupPayload(value: unknown): value is FollowupPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return ["applicationId", "schoolId", "courseId", "chatId", "messageText"].every(
    (field) => typeof p[field] === "string" && (p[field] as string).trim().length > 0,
  );
}

function activationDate(): Date | null {
  if (env.DELAYED_FOLLOWUPS_ENABLED !== "true" || !env.DELAYED_FOLLOWUPS_START_AT) return null;
  const date = new Date(env.DELAYED_FOLLOWUPS_START_AT);
  return Number.isFinite(date.getTime()) && date.getTime() <= Date.now() ? date : null;
}

async function claimNext(activatedAt: Date): Promise<ClaimedEvent | null> {
  // Claim and increment in one atomic statement. No separate SELECT / UPDATE race.
  const claimed = await prisma.$queryRaw<ClaimedEvent[]>`
    WITH candidate AS (
      SELECT id
      FROM public."OutboxEvent"
      WHERE "eventType" = 'delayed_certificate_followup'
        AND status = 'pending'
        -- Secondary safety fence: all legacy events have cuid IDs, new ones have followup: prefix.
        AND id LIKE 'followup:%'
        AND "createdAt" >= ${activatedAt}
        AND "nextAttemptAt" <= NOW()
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public."OutboxEvent" e
    SET status = 'processing',
        "attemptCount" = e."attemptCount" + 1,
        "updatedAt" = NOW()
    FROM candidate
    WHERE e.id = candidate.id
    RETURNING e.id, e."schoolId", e."applicationId", e.payload, e."attemptCount";
  `;
  return claimed[0] ?? null;
}

async function setStatus(id: string, status: "completed" | "cancelled" | "failed" | "pending" | "needs_review", reason?: string, nextAttemptAt?: Date) {
  await prisma.outboxEvent.update({
    where: { id },
    data: {
      status,
      lastError: reason ?? null,
      nextAttemptAt: status === "pending" ? nextAttemptAt : null,
      ...(status === "completed" || status === "cancelled" || status === "failed"
        ? { processedAt: new Date() }
        : {}),
    },
  });
}

type SendResult = "sent" | "rate_limited" | "permanent_failure" | "uncertain";

async function sendOnce(botToken: string, chatId: string, text: string): Promise<SendResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 429) return "rate_limited";
    if (response.status >= 400 && response.status < 500) return "permanent_failure";
    if (!response.ok) return "uncertain";
    // A valid 200 JSON response with ok:true confirms acceptance by Telegram.
    const result: unknown = await response.json();
    if (result && typeof result === "object" && "ok" in result && result.ok === true) return "sent";
    return "uncertain";
  } catch {
    // Network timeouts have uncertain delivery state; never auto-retry blindly.
    return "uncertain";
  }
}

export type FollowupStats = {
  sent: number;
  cancelled: number;
  deferred: number;
  failed: number;
  needsReview: number;
};

export async function processDelayedFollowups(limit = 5): Promise<FollowupStats> {
  const activatedAt = activationDate();
  if (!activatedAt) throw new Error("Delayed follow-up dispatcher is not activated");
  const stats: FollowupStats = { sent: 0, cancelled: 0, deferred: 0, failed: 0, needsReview: 0 };
  for (let i = 0; i < Math.min(limit, 5); i++) {
    const event = await claimNext(activatedAt);
    if (!event) break;

    // Once an event is claimed, ANY unexpected error leaves it in needs_review,
    // rather than automatically risking a duplicate Telegram delivery.
    try {
      if (!isFollowupPayload(event.payload) || event.applicationId !== event.payload.applicationId || event.schoolId !== event.payload.schoolId) {
        await setStatus(event.id, "cancelled", "Invalid follow-up payload");
        stats.cancelled++;
        continue;
      }
      const payload = event.payload;
      const application = await prisma.application.findFirst({
        where: { id: payload.applicationId, schoolId: payload.schoolId },
        select: {
          status: true,
          chatId: true,
          school: { select: { telegramBotTokenEnc: true } },
          courses: {
            where: { courseId: payload.courseId },
            select: { course: { select: { delayedMessageEnabled: true } } },
          },
        },
      });
      if (
        !application || application.status !== "approved" ||
        application.chatId !== payload.chatId ||
        !application.courses.some((ac) => ac.course.delayedMessageEnabled)
      ) {
        await setStatus(event.id, "cancelled", "Approval or course eligibility no longer valid");
        stats.cancelled++;
        continue;
      }
      if (payload.messageText.length > 4096) {
        await setStatus(event.id, "needs_review", "Follow-up exceeds Telegram text limit");
        stats.needsReview++;
        continue;
      }
      const botToken = decryptSecret(application.school.telegramBotTokenEnc);
      const result = await sendOnce(botToken, payload.chatId, payload.messageText);

      if (result === "sent") {
        // Mark completion before optional logging. A log failure must never
        // cause a successfully sent message to be retried.
        await setStatus(event.id, "completed");
        stats.sent++;
        try {
          await prisma.outgoingMessageLog.create({
            data: { schoolId: event.schoolId, chatId: payload.chatId, text: payload.messageText },
          });
        } catch {
          logger.warn("Delayed follow-up sent but outgoing-message log failed", { eventId: event.id });
        }
        continue;
      }
      if (result === "rate_limited") {
        if (event.attemptCount >= 4) {
          await setStatus(event.id, "failed", "Telegram rate limited after 4 attempts");
          stats.failed++;
        } else {
          await setStatus(event.id, "pending", "Telegram rate limit", new Date(Date.now() + 5 * event.attemptCount * 60_000));
          stats.deferred++;
        }
        continue;
      }
      if (result === "permanent_failure") {
        await setStatus(event.id, "failed", "Telegram rejected the message (4xx)");
        stats.failed++;
        continue;
      }
      await setStatus(event.id, "needs_review", "Telegram delivery outcome uncertain — manual review required");
      stats.needsReview++;
    } catch (error) {
      logger.error("Follow-up processing requires review", {
        eventId: event.id,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      await setStatus(event.id, "needs_review", "Unexpected follow-up processing error — manual review required");
      stats.needsReview++;
    }
  }
  return stats;
}
