-- Add per-application BPR choice (q4_bpr_yes/q4_bpr_no).
ALTER TABLE "ApplicationCourse"
  ADD COLUMN IF NOT EXISTS "bprRequired" BOOLEAN NOT NULL DEFAULT false;

