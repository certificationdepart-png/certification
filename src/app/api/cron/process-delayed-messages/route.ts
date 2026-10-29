import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { processDelayedFollowups } from "@/services/delayed-followups.service";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = env.DELAYED_CRON_SECRET;
  if (!secret) return false;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

// This route is invoked by Supabase pg_cron/pg_net, not by Vercel's Hobby Cron.
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (env.DELAYED_FOLLOWUPS_ENABLED !== "true" || !env.DELAYED_FOLLOWUPS_START_AT) {
    return NextResponse.json({ error: "Follow-up dispatch disabled" }, { status: 503 });
  }
  try {
    const stats = await processDelayedFollowups(5);
    return NextResponse.json({ ok: true, ...stats });
  } catch {
    return NextResponse.json({ ok: false, error: "Dispatcher failed; inspect server logs" }, { status: 500 });
  }
}
