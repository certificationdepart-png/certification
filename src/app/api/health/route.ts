import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const startedAt = Date.now();
    await prisma.$queryRaw`SELECT 1`;

    const [pendingSync, failedSync] = await Promise.all([
      prisma.syncJob.count({ where: { status: "pending" } }),
      prisma.syncJob.count({ where: { status: "failed" } }),
    ]);

    let pendingOutbox = 0;
    let failedOutbox = 0;
    try {
      const [pending, failed] = await Promise.all([
        prisma.outboxEvent.count({ where: { status: "pending" } }),
        prisma.outboxEvent.count({ where: { status: "failed" } }),
      ]);
      pendingOutbox = pending;
      failedOutbox = failed;
    } catch {
      pendingOutbox = 0;
      failedOutbox = 0;
    }
    const latencyMs = Date.now() - startedAt;
    const degraded = failedSync > 0 || failedOutbox > 0 || pendingSync > 100;

    return NextResponse.json({
      ok: !degraded,
      status: degraded ? "degraded" : "healthy",
      appVersion: process.env.npm_package_version ?? "0.1.0",
      environment: env.NODE_ENV,
      database: "доступна",
      checks: {
        dbLatencyMs: latencyMs,
        pendingSyncJobs: pendingSync,
        failedSyncJobs: failedSync,
        pendingOutboxEvents: pendingOutbox,
        failedOutboxEvents: failedOutbox,
      },
    });
  } catch (error) {
    logger.error("Перевірка стану не пройшла", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        appVersion: process.env.npm_package_version ?? "0.1.0",
        environment: env.NODE_ENV,
        database: "недоступна",
      },
      { status: 503 },
    );
  }
}

