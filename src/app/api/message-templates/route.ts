import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { parseSchoolIdFromRequest } from "@/lib/api-validation";
import { createTemplate, listTemplatesBySchool } from "@/services/message-templates.service";
import { templateCreateSchema } from "@/services/validation";

export async function GET(request: Request) {
  try {
    await requireApiSession();
    const schoolId = parseSchoolIdFromRequest(request);
    const templates = await listTemplatesBySchool(schoolId);
    return NextResponse.json({ data: templates });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const payload = await request.json();
    const template = await createTemplate(templateCreateSchema.parse(payload));
    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
