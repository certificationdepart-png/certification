import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { getApplicationById, updateApplicationStatus } from "@/services/applications.service";
import { applicationUpdateSchema } from "@/services/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const { id } = idParamSchema.parse(await params);
    const application = await getApplicationById(id);
    return NextResponse.json({ data: application });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireApiSession();
    const { id } = idParamSchema.parse(await params);
    const payload = await request.json();
    const parsed = applicationUpdateSchema.parse(payload);

    const existing = await getApplicationById(id);
    const schoolId = existing.schoolId;

    if (parsed.status) {
      const application = await updateApplicationStatus(id, schoolId, parsed.status, session.user.id);
      return NextResponse.json({ data: application });
    }

    return NextResponse.json({ data: existing });
  } catch (error) {
    return handleRouteError(error);
  }
}
