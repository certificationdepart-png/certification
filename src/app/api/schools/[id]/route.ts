import { NextResponse } from "next/server";

import { requireApiAdminSession, requireApiSession, requireSchoolAccess } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { deleteSchool, getSchoolById, updateSchool } from "@/services/schools.service";
import { schoolUpdateSchema } from "@/services/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { id } = idParamSchema.parse(await params);
    await requireSchoolAccess(session, id, "canViewApplications");
    const school = await getSchoolById(id);
    return NextResponse.json({ data: school });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { id } = idParamSchema.parse(await params);
    await requireSchoolAccess(session, id, "canEditSchool");
    const payload = await request.json();
    const school = await updateSchool(id, schoolUpdateSchema.parse(payload));
    return NextResponse.json({ data: school });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    await requireApiAdminSession();
    const { id } = idParamSchema.parse(await params);
    const result = await deleteSchool(id);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
