-- Emergency stop. SQL changes schedule ONLY, not data.
DO $$
DECLARE selected_job bigint;
BEGIN
  SELECT jobid INTO selected_job FROM cron.job
  WHERE jobname = 'certification-delayed-followups-v2' LIMIT 1;
  IF selected_job IS NOT NULL THEN
    PERFORM cron.unschedule(selected_job);
  END IF;
END;
$$;
