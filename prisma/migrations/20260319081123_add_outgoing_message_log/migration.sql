-- CreateTable
CREATE TABLE "OutgoingMessageLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutgoingMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutgoingMessageLog_schoolId_chatId_createdAt_idx" ON "OutgoingMessageLog"("schoolId", "chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "OutgoingMessageLog" ADD CONSTRAINT "OutgoingMessageLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
