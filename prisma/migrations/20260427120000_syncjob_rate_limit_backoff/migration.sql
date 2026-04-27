ALTER TABLE "SyncJob" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "SyncJob_status_nextAttemptAt_createdAt_idx"
ON "SyncJob"("status", "nextAttemptAt", "createdAt");
