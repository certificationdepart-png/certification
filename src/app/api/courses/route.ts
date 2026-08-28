import { NextResponse } from "next/server";

import { requireApiSession, requireAnySchoolAccess, requireSchoolAccess } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { parseSchoolIdFromRequest } from "@/lib/api-validation";
import { createCourse, listCoursesBySchool } from "@/services/courses.service";
import { courseCreateSchema } from "@/services/validation";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const schoolId = parseSchoolIdFromRequest(request);
    await requireAnySchoolAccess(session, schoolId);
    const courses = await listCoursesBySchool(schoolId);
    return NextResponse.json({ data: courses });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const payload = await request.json();
    const parsed = courseCreateSchema.parse(payload);
    await requireSchoolAccess(session, parsed.schoolId, "canManageCourses");
    const course = await createCourse(parsed);
    return NextResponse.json({ data: course }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
