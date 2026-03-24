-- Add sortOrder to Course for admin-controlled bot display order
ALTER TABLE "Course" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing courses: assign sequential order per school (oldest first = 0, 1, 2, ...)
UPDATE "Course" c
SET "sortOrder" = sub.rn
FROM (
  SELECT id,
    (ROW_NUMBER() OVER (PARTITION BY "schoolId" ORDER BY "createdAt" ASC) - 1) AS rn
  FROM "Course"
) sub
WHERE c.id = sub.id;

-- Index for ordered listing per school
CREATE INDEX "Course_schoolId_sortOrder_idx" ON "Course"("schoolId", "sortOrder");

-- Add externalRowId to ApplicationCourse: tracks the sheet row owned by each course entry
ALTER TABLE "ApplicationCourse" ADD COLUMN "externalRowId" INTEGER;
