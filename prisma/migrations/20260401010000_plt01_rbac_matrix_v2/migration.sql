-- Revise SchoolManagerAccess permission columns (PLT-01 matrix v2)
-- Remove basic flags, add proper granular permissions

ALTER TABLE "SchoolManagerAccess"
  DROP COLUMN IF EXISTS "canAddSchool",
  DROP COLUMN IF EXISTS "canAddCourses",
  ADD COLUMN "canManageApplications" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageCourses"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageTemplates"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageSync"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canCreateSchool"       BOOLEAN NOT NULL DEFAULT false;
