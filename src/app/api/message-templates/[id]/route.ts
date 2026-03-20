import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema, parseSchoolIdFromRequest } from "@/lib/api-validation";
import { deleteTemplate, updateTemplate } from "@/services/message-templates.service";
import { templateUpdateSchema } from "@/services/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const schoolId = parseSchoolIdFromRequest(request);
    const { id } = idParamSchema.parse(await params);
    const payload = await request.json();
    const template = await updateTemplate(id, schoolId, templateUpdateSchema.parse(payload));
    return NextResponse.json({ data: template });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const schoolId = parseSchoolIdFromRequest(request);
    const { id } = idParamSchema.parse(await params);
    const result = await deleteTemplate(id, schoolId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
