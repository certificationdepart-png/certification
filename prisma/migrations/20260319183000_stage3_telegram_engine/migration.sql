-- CreateEnum
CREATE TYPE "SessionStep" AS ENUM (
  'q1_start',
  'q2_course',
  'q3_screenshots',
  'q4_certificate_type',
  'q5_name_ua',
  'q6_name_en',
  'q7_delivery',
  'q8_score',
  'q9_feedback',
  'q10_confirmation',
  'q11_finish'
);

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM (
  'new',
  'submitted',
  'manager_checked',
  'approved',
  'rejected'
);

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('none', 'ua', 'abroad');

-- CreateEnum
CREATE TYPE "CertificateFormat" AS ENUM ('electronic', 'physical', 'both');

-- CreateTable
CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "telegramUsername" TEXT,
  "currentStep" "SessionStep" NOT NULL DEFAULT 'q1_start',
  "state" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdateLog" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "updateId" BIGINT NOT NULL,
  "chatId" TEXT,
  "telegramUserId" TEXT,
  "updateType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "sessionId" TEXT,
  "telegramUserId" TEXT NOT NULL,
  "telegramUsername" TEXT,
  "chatId" TEXT NOT NULL,
  "studentNameUa" TEXT NOT NULL,
  "studentNameEn" TEXT NOT NULL,
  "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'none',
  "deliveryCity" TEXT,
  "deliveryBranch" TEXT,
  "deliveryAddress" TEXT,
  "deliveryCountry" TEXT,
  "deliveryPhone" TEXT,
  "deliveryEmail" TEXT,
  "score" INTEGER,
  "feedbackText" TEXT,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCourse" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "certificateFormat" "CertificateFormat" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationScreenshot" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_schoolId_chatId_key" ON "UserSession"("schoolId", "chatId");
CREATE INDEX "UserSession_schoolId_telegramUserId_idx" ON "UserSession"("schoolId", "telegramUserId");
CREATE INDEX "UserSession_createdAt_idx" ON "UserSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdateLog_schoolId_updateId_key" ON "TelegramUpdateLog"("schoolId", "updateId");
CREATE INDEX "TelegramUpdateLog_schoolId_createdAt_idx" ON "TelegramUpdateLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "Application_schoolId_createdAt_idx" ON "Application"("schoolId", "createdAt");
CREATE INDEX "Application_schoolId_telegramUserId_createdAt_idx" ON "Application"("schoolId", "telegramUserId", "createdAt");
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCourse_applicationId_courseId_key" ON "ApplicationCourse"("applicationId", "courseId");
CREATE INDEX "ApplicationCourse_courseId_idx" ON "ApplicationCourse"("courseId");

-- CreateIndex
CREATE INDEX "ApplicationScreenshot_applicationId_sortOrder_idx" ON "ApplicationScreenshot"("applicationId", "sortOrder");

-- AddForeignKey
ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramUpdateLog"
ADD CONSTRAINT "TelegramUpdateLog_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application"
ADD CONSTRAINT "Application_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application"
ADD CONSTRAINT "Application_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCourse"
ADD CONSTRAINT "ApplicationCourse_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCourse"
ADD CONSTRAINT "ApplicationCourse_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationScreenshot"
ADD CONSTRAINT "ApplicationScreenshot_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
