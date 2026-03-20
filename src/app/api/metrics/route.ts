import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { observability } from "@/lib/observability";

export async function GET() {
  await requireApiSession(["admin", "manager"]);

  const [syncPending, syncProcessing, syncCompleted, syncFailed] = await Promise.all([
    prisma.syncJob.count({ where: { status: "pending" } }),
    prisma.syncJob.count({ where: { status: "processing" } }),
    prisma.syncJob.count({ where: { status: "completed" } }),
    prisma.syncJob.count({ where: { status: "failed" } }),
  ]);

  // Outbox may not exist in some environments if migrations are behind.
  let outboxPending = 0;
  let outboxProcessing = 0;
  let outboxCompleted = 0;
  let outboxFailed = 0;
  try {
    const counts = await Promise.all([
      prisma.outboxEvent.count({ where: { status: "pending" } }),
      prisma.outboxEvent.count({ where: { status: "processing" } }),
      prisma.outboxEvent.count({ where: { status: "completed" } }),
      prisma.outboxEvent.count({ where: { status: "failed" } }),
    ]);
    [outboxPending, outboxProcessing, outboxCompleted, outboxFailed] = counts;
  } catch {
    // ignore table-missing/outbox-missing errors; return empty outbox metrics
  }

  const snapshot = observability.snapshot();

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    syncQueue: {
      pending: syncPending,
      processing: syncProcessing,
      completed: syncCompleted,
      failed: syncFailed,
    },
    outboxQueue: {
      pending: outboxPending,
      processing: outboxProcessing,
      completed: outboxCompleted,
      failed: outboxFailed,
    },
    runtime: snapshot,
  });
}

