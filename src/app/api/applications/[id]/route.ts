import { NextResponse } from "next/server";

import { requireApiSession, requireSchoolAccess } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { deleteApplication, getApplicationById, rejectApplication, updateApplicationStatus } from "@/services/applications.service";
import { applicationUpdateSchema } from "@/services/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { id } = idParamSchema.parse(await params);
    const application = await getApplicationById(id);
    await requireSchoolAccess(session, application.schoolId, "canViewApplications");
    return NextResponse.json({ data: application });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { id } = idParamSchema.parse(await params);
    const payload = await request.json();
    const parsed = applicationUpdateSchema.parse(payload);

    const existing = await getApplicationById(id);
    const schoolId = existing.schoolId;
    await requireSchoolAccess(session, schoolId, "canManageApplications");

    if (parsed.status === "rejected" && parsed.rejectionReasonId) {
      await rejectApplication(id, schoolId, parsed.rejectionReasonId, session.user.id);
      const updated = await getApplicationById(id);
      return NextResponse.json({ data: updated });
    }

    if (parsed.status) {
      const application = await updateApplicationStatus(id, schoolId, parsed.status, session.user.id);
      return NextResponse.json({ data: application });
    }

    return NextResponse.json({ data: existing });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { id } = idParamSchema.parse(await params);
    const existing = await getApplicationById(id);
    await requireSchoolAccess(session, existing.schoolId, "canDeleteApplications");
    await deleteApplication(id, existing.schoolId);
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
