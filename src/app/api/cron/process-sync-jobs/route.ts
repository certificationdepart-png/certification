import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { applyRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { processOneSyncJob } from "@/services/google-sheets-sync.service";
import { processOneOutboxEvent } from "@/services/outbox.service";

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

  let processed = 0;
  let processedOutbox = 0;

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    try {
      const didProcess = await processOneSyncJob();
      if (!didProcess) break;
      processed++;
    } catch {
      break;
    }
  }

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    try {
      const didProcess = await processOneOutboxEvent();
      if (!didProcess) break;
      processedOutbox++;
    } catch {
      break;
    }
  }

  return NextResponse.json({ ok: true, processed, processedOutbox });
}
