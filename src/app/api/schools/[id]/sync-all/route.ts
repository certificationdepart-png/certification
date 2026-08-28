import { NextResponse } from "next/server";

import { requireApiSession, requireSchoolAccess } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { prisma } from "@/lib/db";
import { enqueueSyncJob, processOneSyncJobForSchool } from "@/services/google-sheets-sync.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { id: schoolId } = idParamSchema.parse(await params);
    await requireSchoolAccess(session, schoolId, "canManageSync");

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    const applications = await prisma.application.findMany({
      where: { schoolId },
      select: { id: true },
    });

    for (const app of applications) {
      await enqueueSyncJob(schoolId, app.id);
    }

    // Immediately process pending jobs for this school so the admin "Re-sync"
    // button feels instant (cron will still continue to process any remaining jobs).
    let processed = 0;
    while (true) {
      const didProcess = await processOneSyncJobForSchool(schoolId);
      if (!didProcess) break;
      processed += 1;
    }

    return NextResponse.json({ ok: true, enqueued: applications.length, processed });
  } catch (error) {
    return handleRouteError(error);
  }
}
