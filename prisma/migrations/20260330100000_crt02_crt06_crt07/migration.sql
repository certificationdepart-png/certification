-- CRT-02: Recipient fields for Nova Poshta delivery
ALTER TABLE "Application" ADD COLUMN "recipientName" TEXT;
ALTER TABLE "Application" ADD COLUMN "recipientPhone" TEXT;

-- CRT-06: Delayed message after certificate delivery
ALTER TABLE "Course" ADD COLUMN "delayedMessageEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "delayedMessageText" TEXT;
ALTER TABLE "Course" ADD COLUMN "delayedMessageDays" INTEGER NOT NULL DEFAULT 1;

-- CRT-07: Rejection reasons
CREATE TABLE "RejectionReason" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RejectionReason_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RejectionReason_schoolId_sortOrder_idx" ON "RejectionReason"("schoolId", "sortOrder");

ALTER TABLE "RejectionReason" ADD CONSTRAINT "RejectionReason_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application" ADD COLUMN "rejectionReasonId" TEXT;

ALTER TABLE "Application" ADD CONSTRAINT "Application_rejectionReasonId_fkey"
    FOREIGN KEY ("rejectionReasonId") REFERENCES "RejectionReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
