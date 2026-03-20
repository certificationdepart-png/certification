-- AlterTable
DO $$
BEGIN
  -- Important: use the active schema from the connection string.
  -- This migration is an optional hardening step and must not fail on a
  -- fresh DB where `OutboxEvent` (and `updatedAt`) don't exist yet.
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'OutboxEvent'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'OutboxEvent'
      AND column_name = 'updatedAt'
      AND column_default IS NOT NULL
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT',
      current_schema(), 'OutboxEvent', 'updatedAt'
    );
  END IF;
END $$;

-- AlterTable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'SyncJob'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SyncJob'
      AND column_name = 'updatedAt'
      AND column_default IS NOT NULL
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT',
      current_schema(), 'SyncJob', 'updatedAt'
    );
  END IF;
END $$;
