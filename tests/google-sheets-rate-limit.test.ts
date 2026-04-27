import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  syncJob: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  syncError: {
    create: vi.fn(),
  },
  school: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/env", () => ({
  env: {
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "local@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nlocal\\n-----END PRIVATE KEY-----\\n",
    }),
    GOOGLE_SERVICE_ACCOUNT_JSON_B64: null,
  },
}));

vi.mock("@/lib/observability", () => ({
  observability: {
    increment: vi.fn(),
  },
}));

import {
  getGoogleSheetsRateLimitRetryDelayMs,
  processOneSyncJob,
} from "@/services/google-sheets-sync.service";

describe("Google Sheets sync rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("parses Google Sheets quota errors as retryable rate limits", () => {
    const error = new Error("Quota exceeded for quota metric 'Read requests'");
    Object.assign(error, {
      response: {
        status: 429,
        headers: { "retry-after": "120" },
      },
    });

    expect(getGoogleSheetsRateLimitRetryDelayMs(error, 1)).toBe(120_000);
  });

  it("keeps a rate-limited sync job pending until retry-after instead of retrying immediately", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T08:00:00.000Z"));

    const rateLimitError = new Error("Quota exceeded for quota metric 'Read requests'");
    Object.assign(rateLimitError, {
      response: {
        status: 429,
        headers: { "retry-after": "120" },
      },
    });

    prismaMock.syncJob.findFirst.mockResolvedValue({ id: "job-1" });
    prismaMock.syncJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.syncJob.findUnique.mockResolvedValue({
      id: "job-1",
      schoolId: "school-1",
      applicationId: "app-1",
      attemptCount: 0,
    });
    prismaMock.school.findUnique.mockRejectedValue(rateLimitError);
    prismaMock.syncJob.update.mockResolvedValue({});

    await expect(processOneSyncJob()).rejects.toThrow("Quota exceeded");

    expect(prismaMock.syncJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "pending",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date("2026-04-27T08:00:00.000Z") } }],
        },
      }),
    );
    expect(prismaMock.syncJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "pending",
        attemptCount: 1,
        nextAttemptAt: new Date("2026-04-27T08:02:00.000Z"),
        processingStartedAt: null,
      }),
    });
  });
});
