-- Ідемпотентно додає q4_add_more_courses, якщо його ще немає в PG enum.
-- Корисно, якщо попередня міграція не виконалась на конкретній БД (інший DATABASE_URL,
-- відновлення з бекапу, помилка на PostgreSQL < 12 у транзакції тощо).
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_enum e
    INNER JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'SessionStep'
      AND e.enumlabel = 'q4_add_more_courses'
  ) THEN
    ALTER TYPE "SessionStep" ADD VALUE 'q4_add_more_courses';
  END IF;
END
$migration$;
