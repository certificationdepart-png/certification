import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { observability } from "@/lib/observability";
import { enqueueSyncJob } from "@/services/google-sheets-sync.service";
import { sendConfirmationNotifications } from "@/services/telegram/telegram-notification.service";

const MAX_OUTBOX_ATTEMPTS = 5;
const outboxEvent = prisma.outboxEvent;

type ApplicationStatusChangedPayload = {
  applicationId: string;
  schoolId: string;
  newStatus: string;
};

type DelayedCertFollowupPayload = {
  applicationId: string;
  schoolId: string;
  courseId: string;
  messageText: string;
  chatId: string;
};

function isMissingOutboxTable(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("TableDoesNotExist") ||
    error.message.includes('OutboxEvent') ||
    error.message.includes('outboxEvent')
  );
}

export async function enqueueDelayedCertFollowup(payload: DelayedCertFollowupPayload, delayDays: number) {
  await outboxEvent.create({
    data: {
      schoolId: payload.schoolId,
      applicationId: payload.applicationId,
      eventType: "delayed_certificate_followup",
      payload,
      status: "pending",
      nextAttemptAt: new Date(Date.now() + delayDays * 86_400_000),
    },
  });
}

export async function enqueueApplicationStatusChangedEvent(payload: ApplicationStatusChangedPayload) {
  try {
    await outboxEvent.create({
      data: {
        schoolId: payload.schoolId,
        applicationId: payload.applicationId,
        eventType: "application.status_changed",
        payload,
        status: "pending",
      },
    });
  } catch (error) {
    // In dev/prod rollout, the code might deploy before migrations. Avoid hard-failing.
    if (!isMissingOutboxTable(error)) throw error;

    await enqueueSyncJob(payload.schoolId, payload.applicationId);
    if (payload.newStatus === "approved") {
      await sendConfirmationNotifications(payload.applicationId);
    }
  }
}

async function claimPendingOutboxEvent() {
  const event = await outboxEvent.findFirst({
    where: {
      status: "pending",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!event) return null;

  const claimed = await outboxEvent.updateMany({
    where: { id: event.id, status: "pending" },
    data: { status: "processing" },
  });
  if (claimed.count === 0) return null;

  return outboxEvent.findUnique({
    where: { id: event.id },
  });
}

async function processDelayedCertFollowup(eventId: string, payload: DelayedCertFollowupPayload) {
  const application = await prisma.application.findUnique({
    where: { id: payload.applicationId },
    select: { id: true, school: { select: { telegramBotTokenEnc: true } } },
  });

  if (application) {
    const { decryptSecret } = await import("@/lib/crypto");
    const { createTelegramClientWithLogging } = await import("@/services/telegram/telegram-client-with-logging");
    const botToken = decryptSecret(application.school.telegramBotTokenEnc);
    const telegramClient = createTelegramClientWithLogging(payload.schoolId);
    await telegramClient.sendMessage({ botToken, chatId: payload.chatId, text: payload.messageText });
  }

  await outboxEvent.update({
    where: { id: eventId },
    data: { status: "completed", processedAt: new Date(), lastError: null },
  });
  observability.increment("outbox.processed.total");
}

async function processApplicationStatusChanged(eventId: string, payload: ApplicationStatusChangedPayload) {
  await enqueueSyncJob(payload.schoolId, payload.applicationId);

  if (payload.newStatus === "approved") {
    await sendConfirmationNotifications(payload.applicationId);
  }

  await outboxEvent.update({
    where: { id: eventId },
    data: {
      status: "completed",
      processedAt: new Date(),
      lastError: null,
    },
  });
  observability.increment("outbox.processed.total");
}

async function markOutboxFailure(eventId: string, attempt: number, message: string) {
  const shouldFail = attempt >= MAX_OUTBOX_ATTEMPTS;
  await outboxEvent.update({
    where: { id: eventId },
    data: {
      attemptCount: attempt,
      status: shouldFail ? "failed" : "pending",
      lastError: message,
      nextAttemptAt: shouldFail ? null : new Date(Date.now() + attempt * 30_000),
    },
  });
  if (shouldFail) {
    observability.increment("outbox.failed.total");
  }
}

export async function processOneOutboxEvent(): Promise<boolean> {
  let event;
  try {
    event = await claimPendingOutboxEvent();
  } catch (error) {
    if (isMissingOutboxTable(error)) return false;
    throw error;
  }
  if (!event) {
    return false;
  }

  const attempt = event.attemptCount + 1;
  try {
    if (event.eventType === "application.status_changed") {
      await processApplicationStatusChanged(event.id, event.payload as ApplicationStatusChangedPayload);
      return true;
    }

    if (event.eventType === "delayed_certificate_followup") {
      await processDelayedCertFollowup(event.id, event.payload as DelayedCertFollowupPayload);
      return true;
    }

    await outboxEvent.update({
      where: { id: event.id },
      data: {
        status: "failed",
        lastError: `Unsupported event type: ${event.eventType}`,
        attemptCount: attempt,
      },
    });
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to process outbox event", { eventId: event.id, message });
    await markOutboxFailure(event.id, attempt, message);
    return false;
  }
}
