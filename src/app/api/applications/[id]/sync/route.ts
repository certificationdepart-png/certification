import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { getApplicationById } from "@/services/applications.service";
import { enqueueSyncJob } from "@/services/google-sheets-sync.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const { id } = idParamSchema.parse(await params);

    const application = await getApplicationById(id);

    await enqueueSyncJob(application.schoolId, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
