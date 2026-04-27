import { describe, expect, it, vi } from "vitest";

import { processSyncQueues } from "@/services/sync-queue-runner.service";

describe("sync queue runner", () => {
  it("processes outbox-created sync jobs in the same run", async () => {
    const calls: string[] = [];
    let outboxCalls = 0;
    let syncCalls = 0;

    const result = await processSyncQueues({
      maxJobs: 20,
      processOneOutboxEvent: vi.fn(async () => {
        if (outboxCalls > 0) return false;
        outboxCalls += 1;
        calls.push("outbox");
        return true;
      }),
      processOneSyncJob: vi.fn(async () => {
        if (!calls.includes("outbox") || syncCalls > 0) return false;
        syncCalls += 1;
        calls.push("sync");
        return true;
      }),
    });

    expect(calls).toEqual(["outbox", "sync"]);
    expect(result).toEqual({ processed: 1, processedOutbox: 1 });
  });

  it("respects maxJobs independently for outbox and sync queues", async () => {
    const processOneOutboxEvent = vi.fn(async () => true);
    const processOneSyncJob = vi.fn(async () => true);

    const result = await processSyncQueues({
      maxJobs: 3,
      processOneOutboxEvent,
      processOneSyncJob,
    });

    expect(processOneOutboxEvent).toHaveBeenCalledTimes(3);
    expect(processOneSyncJob).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ processed: 3, processedOutbox: 3 });
  });

  it("still drains existing sync jobs when outbox processing throws", async () => {
    const calls: string[] = [];
    let syncCalls = 0;

    const result = await processSyncQueues({
      maxJobs: 20,
      processOneOutboxEvent: vi.fn(async () => {
        calls.push("outbox-error");
        throw new Error("temporary outbox failure");
      }),
      processOneSyncJob: vi.fn(async () => {
        if (syncCalls > 0) return false;
        syncCalls += 1;
        calls.push("sync");
        return true;
      }),
    });

    expect(calls).toEqual(["outbox-error", "sync"]);
    expect(result).toEqual({ processed: 1, processedOutbox: 0 });
  });

  it("does not process sync when both queues are empty", async () => {
    const processOneOutboxEvent = vi.fn(async () => false);
    const processOneSyncJob = vi.fn(async () => false);

    const result = await processSyncQueues({
      processOneOutboxEvent,
      processOneSyncJob,
    });

    expect(processOneOutboxEvent).toHaveBeenCalledTimes(1);
    expect(processOneSyncJob).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ processed: 0, processedOutbox: 0 });
  });
});
