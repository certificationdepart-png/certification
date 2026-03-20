import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema, parseSchoolIdFromRequest } from "@/lib/api-validation";
import { deleteCourse, updateCourse } from "@/services/courses.service";
import { courseUpdateSchema } from "@/services/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const schoolId = parseSchoolIdFromRequest(request);
    const { id } = idParamSchema.parse(await params);
    const payload = await request.json();
    const course = await updateCourse(id, schoolId, courseUpdateSchema.parse(payload));
    return NextResponse.json({ data: course });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const schoolId = parseSchoolIdFromRequest(request);
    const { id } = idParamSchema.parse(await params);
    const result = await deleteCourse(id, schoolId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
