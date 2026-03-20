-- Stage 6: reliability hardening primitives

ALTER TABLE "SyncJob"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "processingStartedAt" TIMESTAMP(3);

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "applicationId" TEXT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OutboxEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");
CREATE INDEX "OutboxEvent_eventType_status_idx" ON "OutboxEvent"("eventType", "status");
CREATE INDEX "OutboxEvent_schoolId_status_idx" ON "OutboxEvent"("schoolId", "status");

ALTER TABLE "OutboxEvent"
ADD CONSTRAINT "OutboxEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboxEvent"
ADD CONSTRAINT "OutboxEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
