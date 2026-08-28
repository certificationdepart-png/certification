-- CreateTable
CREATE TABLE "SchoolManagerAccess" (
    "id"                    TEXT NOT NULL,
    "userId"                TEXT NOT NULL,
    "schoolId"              TEXT NOT NULL,
    "canViewApplications"   BOOLEAN NOT NULL DEFAULT false,
    "canDeleteApplications" BOOLEAN NOT NULL DEFAULT false,
    "canEditSchool"         BOOLEAN NOT NULL DEFAULT false,
    "canAddSchool"          BOOLEAN NOT NULL DEFAULT false,
    "canAddCourses"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolManagerAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolManagerAccess_userId_schoolId_key" ON "SchoolManagerAccess"("userId", "schoolId");

-- CreateIndex
CREATE INDEX "SchoolManagerAccess_userId_idx" ON "SchoolManagerAccess"("userId");

-- CreateIndex
CREATE INDEX "SchoolManagerAccess_schoolId_idx" ON "SchoolManagerAccess"("schoolId");

-- AddForeignKey
ALTER TABLE "SchoolManagerAccess" ADD CONSTRAINT "SchoolManagerAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolManagerAccess" ADD CONSTRAINT "SchoolManagerAccess_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
