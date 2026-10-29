-- DO NOT RUN DURING PREPARATION.
-- Run ONLY AFTER:
--  1. patched app deployed and existing admin login confirmed;
--  2. legacy follow-ups cancelled;
--  3. DELAYED_FOLLOWUPS_ENABLED=true on production and new production deployed;
--  4. DELAYED_FOLLOWUPS_START_AT is a future/current UTC timestamp strictly AFTER
--     the old code stopped generating events;
--  5. in Supabase Vault, secret named certification_delayed_cron_secret was created
--     and equals Vercel DELAYED_CRON_SECRET (not CRON_SECRET).
-- NEVER paste the actual bearer secret into SQL history / Git.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'certification_delayed_cron_secret'
      AND length(decrypted_secret) >= 32
  ) THEN
    RAISE EXCEPTION 'Missing Vault secret certification_delayed_cron_secret';
  END IF;
END;
$$;

SELECT cron.schedule(
  'certification-delayed-followups-v2',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://certification-brown.vercel.app/api/cron/process-delayed-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'certification_delayed_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $job$
);
