type QueueProcessor = () => Promise<boolean>;

export type ProcessSyncQueuesOptions = {
  maxJobs?: number;
  processOneOutboxEvent?: QueueProcessor;
  processOneSyncJob?: QueueProcessor;
};

export async function processSyncQueues(options: ProcessSyncQueuesOptions = {}) {
  const maxJobs = options.maxJobs ?? 20;
  const runOutbox = options.processOneOutboxEvent ?? (await import("@/services/outbox.service")).processOneOutboxEvent;
  const runSync = options.processOneSyncJob ?? (await import("@/services/google-sheets-sync.service")).processOneSyncJob;

  let processedOutbox = 0;
  let processed = 0;

  for (let i = 0; i < maxJobs; i++) {
    try {
      const didProcess = await runOutbox();
      if (!didProcess) break;
      processedOutbox++;
    } catch {
      break;
    }
  }

  for (let i = 0; i < maxJobs; i++) {
    try {
      const didProcess = await runSync();
      if (!didProcess) break;
      processed++;
    } catch {
      break;
    }
  }

  return { processed, processedOutbox };
}
