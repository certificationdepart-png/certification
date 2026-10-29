-- READ_ONLY. Delivery backlog and ambiguous outcomes, per school, without names.
SELECT s.name AS school, e.status, count(*) AS total,
       min(e."createdAt") AS oldest_created,
       min(e."nextAttemptAt") AS next_due
FROM public."OutboxEvent" e
JOIN public."School" s ON s.id = e."schoolId"
WHERE e."eventType" = 'delayed_certificate_followup'
GROUP BY s.name, e.status
ORDER BY s.name, e.status;

-- Queries below can expose scheduler metadata only (not Vault secrets).
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
SELECT jobid, status, start_time, end_time
FROM cron.job_run_details
WHERE start_time > now() - INTERVAL '1 day'
ORDER BY start_time DESC LIMIT 20;
