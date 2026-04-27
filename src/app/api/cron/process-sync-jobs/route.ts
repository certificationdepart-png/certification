import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { applyRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { processSyncQueues } from "@/services/sync-queue-runner.service";

const MAX_JOBS_PER_RUN = 20;

export async function GET(request: Request) {
  const fingerprint = getRequestFingerprint(request);
  const rateLimit = applyRateLimit({
    key: `cron:process-sync-jobs:${fingerprint}`,
    limit: env.RATE_LIMIT_CRON_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization");
  const cronSecret = env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { processed, processedOutbox } = await processSyncQueues({ maxJobs: MAX_JOBS_PER_RUN });

  return NextResponse.json({ ok: true, processed, processedOutbox });
}
