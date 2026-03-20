-- Map former "manager_checked" to "approved" (single manager confirmation step).
UPDATE "Application" SET "status" = 'approved' WHERE "status"::text = 'manager_checked';
UPDATE "ApplicationStatusHistory" SET "fromStatus" = 'approved' WHERE "fromStatus"::text = 'manager_checked';
UPDATE "ApplicationStatusHistory" SET "toStatus" = 'approved' WHERE "toStatus"::text = 'manager_checked';

-- Replace enum: PostgreSQL cannot drop enum values in place.
CREATE TYPE "ApplicationStatus_new" AS ENUM ('new', 'submitted', 'approved', 'rejected');

ALTER TABLE "Application" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Application" ALTER COLUMN "status" TYPE "ApplicationStatus_new" USING ("status"::text::"ApplicationStatus_new");
ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'submitted'::"ApplicationStatus_new";

ALTER TABLE "ApplicationStatusHistory" ALTER COLUMN "fromStatus" TYPE "ApplicationStatus_new" USING ("fromStatus"::text::"ApplicationStatus_new");
ALTER TABLE "ApplicationStatusHistory" ALTER COLUMN "toStatus" TYPE "ApplicationStatus_new" USING ("toStatus"::text::"ApplicationStatus_new");

DROP TYPE "ApplicationStatus";
ALTER TYPE "ApplicationStatus_new" RENAME TO "ApplicationStatus";
