import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { processSyncJobById } from "@/services/google-sheets-sync.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const { id } = await params;

    const job = await prisma.syncJob.findUnique({
      where: { id },
      include: { application: { select: { schoolId: true } } },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status === "failed" || job.status === "completed") {
      await prisma.syncJob.update({
        where: { id },
        data: {
          status: "pending",
          lastError: null,
          completedAt: null,
          processingStartedAt: null,
        },
      });
    }

    let processed = false;
    try {
      processed = await processSyncJobById(id);
    } catch {
      // Job may fail; status will be updated by processSyncJobById
    }

    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    return handleRouteError(error);
  }
}
