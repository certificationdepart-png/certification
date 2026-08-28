import { NextResponse } from "next/server";

import { requireApiSession, requireAnySchoolAccess, requireSchoolAccess } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { parseSchoolIdFromRequest } from "@/lib/api-validation";
import { createTemplate, listTemplatesBySchool } from "@/services/message-templates.service";
import { templateCreateSchema } from "@/services/validation";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const schoolId = parseSchoolIdFromRequest(request);
    await requireAnySchoolAccess(session, schoolId);
    const templates = await listTemplatesBySchool(schoolId);
    return NextResponse.json({ data: templates });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const payload = await request.json();
    const parsed = templateCreateSchema.parse(payload);
    await requireSchoolAccess(session, parsed.schoolId, "canManageTemplates");
    const template = await createTemplate(parsed);
    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
