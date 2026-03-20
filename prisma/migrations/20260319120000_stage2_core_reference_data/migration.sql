-- AlterTable
ALTER TABLE "School"
ADD COLUMN "googleSheetId" TEXT,
ADD COLUMN "googleSheetUrl" TEXT,
ADD COLUMN "novaPoshtaApiKeyEnc" TEXT,
ADD COLUMN "schoolKey" TEXT,
ADD COLUMN "secretEncryptionKeyVer" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "telegramBotTokenEnc" TEXT,
ADD COLUMN "telegramChatId" TEXT;

-- Backfill existing rows before NOT NULL constraints
UPDATE "School"
SET
  "schoolKey" = COALESCE("schoolKey", CONCAT('school_', "slug")),
  "telegramChatId" = COALESCE("telegramChatId", 'replace-me-chat-id'),
  "telegramBotTokenEnc" = COALESCE("telegramBotTokenEnc", 'replace-me-encrypted-bot-token'),
  "novaPoshtaApiKeyEnc" = COALESCE("novaPoshtaApiKeyEnc", 'replace-me-encrypted-nova-poshta-key'),
  "googleSheetId" = COALESCE("googleSheetId", 'replace-me-google-sheet-id')
WHERE
  "schoolKey" IS NULL
  OR "telegramChatId" IS NULL
  OR "telegramBotTokenEnc" IS NULL
  OR "novaPoshtaApiKeyEnc" IS NULL
  OR "googleSheetId" IS NULL;

-- Enforce required columns
ALTER TABLE "School"
ALTER COLUMN "schoolKey" SET NOT NULL,
ALTER COLUMN "telegramChatId" SET NOT NULL,
ALTER COLUMN "telegramBotTokenEnc" SET NOT NULL,
ALTER COLUMN "novaPoshtaApiKeyEnc" SET NOT NULL,
ALTER COLUMN "googleSheetId" SET NOT NULL;

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "certificateType" TEXT NOT NULL,
    "daysToSend" INTEGER NOT NULL,
    "reviewLink" TEXT,
    "requirementsText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_schoolKey_key" ON "School"("schoolKey");

-- CreateIndex
CREATE INDEX "School_createdAt_idx" ON "School"("createdAt");

-- CreateIndex
CREATE INDEX "Course_schoolId_idx" ON "Course"("schoolId");

-- CreateIndex
CREATE INDEX "Course_createdAt_idx" ON "Course"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_schoolId_code_key" ON "MessageTemplate"("schoolId", "code");

-- CreateIndex
CREATE INDEX "MessageTemplate_schoolId_idx" ON "MessageTemplate"("schoolId");

-- CreateIndex
CREATE INDEX "MessageTemplate_createdAt_idx" ON "MessageTemplate"("createdAt");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
