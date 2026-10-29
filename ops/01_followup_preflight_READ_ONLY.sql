-- READ ONLY. Before activating the NEW dispatcher.
SELECT "eventType", status, count(*) AS total,
       count(*) FILTER (WHERE "nextAttemptAt" <= now()) AS due_now
FROM public."OutboxEvent"
WHERE "eventType" = 'delayed_certificate_followup'
GROUP BY "eventType", status
ORDER BY status;

-- No job should be active before endpoint deployment and end-to-end tests.
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;

-- Check extensions, without changing them.
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('pg_cron', 'pg_net');
