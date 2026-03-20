import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const headersMock = vi.hoisted(() => vi.fn(async () => new Headers()));

const prismaMock = vi.hoisted(() => ({
  outboxEvent: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const enqueueSyncJobMock = vi.hoisted(() => vi.fn());
const sendConfirmationNotificationsMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: sessionMock,
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/services/google-sheets-sync.service", () => ({
  enqueueSyncJob: enqueueSyncJobMock,
  upsertApplicationRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/telegram/telegram-notification.service", () => ({
  sendConfirmationNotifications: sendConfirmationNotificationsMock,
}));

import { requireApiSession } from "@/lib/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { processOneOutboxEvent } from "@/services/outbox.service";

describe("stage6 security and reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RBAC requireApiSession", () => {
    it("rejects user without admin role by default", async () => {
      sessionMock.getSession.mockResolvedValue({
        session: { id: "s-1" },
        user: { id: "u-1", role: "user" },
      });

      await expect(requireApiSession()).rejects.toThrow("Недостатньо прав доступу");
    });

    it("allows admin user", async () => {
      sessionMock.getSession.mockResolvedValue({
        session: { id: "s-1" },
        user: { id: "u-1", role: "admin" },
      });

      await expect(requireApiSession()).resolves.toBeTruthy();
    });
  });

  describe("rate limiting", () => {
    it("blocks requests above configured limit", () => {
      const first = applyRateLimit({ key: "test-key", limit: 2, windowMs: 60_000 });
      const second = applyRateLimit({ key: "test-key", limit: 2, windowMs: 60_000 });
      const third = applyRateLimit({ key: "test-key", limit: 2, windowMs: 60_000 });

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(true);
      expect(third.allowed).toBe(false);
    });
  });

  describe("outbox processing", () => {
    it("claims and processes application.status_changed event", async () => {
      prismaMock.outboxEvent.findFirst.mockResolvedValue({ id: "evt-1" });
      prismaMock.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.outboxEvent.findUnique.mockResolvedValue({
        id: "evt-1",
        attemptCount: 0,
        eventType: "application.status_changed",
        payload: {
          schoolId: "school-1",
          applicationId: "app-1",
          newStatus: "submitted",
        },
      });
      prismaMock.outboxEvent.update.mockResolvedValue({});
      enqueueSyncJobMock.mockResolvedValue(undefined);
      sendConfirmationNotificationsMock.mockResolvedValue(undefined);

      const processed = await processOneOutboxEvent();

      expect(processed).toBe(true);
      expect(enqueueSyncJobMock).toHaveBeenCalledWith("school-1", "app-1");
      expect(sendConfirmationNotificationsMock).not.toHaveBeenCalled();
      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "evt-1" },
          data: expect.objectContaining({ status: "completed" }),
        }),
      );
    });
  });
});
