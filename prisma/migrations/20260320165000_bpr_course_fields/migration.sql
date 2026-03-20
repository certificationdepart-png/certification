-- Add BPR (Бали БПР) question step for dialog flow.
-- Also adds per-course config fields for rendering BPR prompts in the Telegram bot.

-- Idempotently add enum value.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_enum e
    INNER JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'SessionStep'
      AND e.enumlabel = 'q4_bpr_question'
  ) THEN
    ALTER TYPE "SessionStep" ADD VALUE 'q4_bpr_question';
  END IF;
END
$migration$;

-- Add BPR course config fields.
ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "bprEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "bprSpecialtyCheckLink" TEXT;

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "bprTestLink" TEXT;

