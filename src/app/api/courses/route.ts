import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { parseSchoolIdFromRequest } from "@/lib/api-validation";
import { createCourse, listCoursesBySchool } from "@/services/courses.service";
import { courseCreateSchema } from "@/services/validation";

export async function GET(request: Request) {
  try {
    await requireApiSession();
    const schoolId = parseSchoolIdFromRequest(request);
    const courses = await listCoursesBySchool(schoolId);
    return NextResponse.json({ data: courses });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const payload = await request.json();
    const course = await createCourse(courseCreateSchema.parse(payload));
    return NextResponse.json({ data: course }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
