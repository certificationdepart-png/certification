import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { schoolCreateSchema } from "@/services/validation";
import { createSchool, listSchools, listSchoolsWithSyncStats } from "@/services/schools.service";

export async function GET(request: Request) {
  try {
    await requireApiSession();
    const { searchParams } = new URL(request.url);
    const syncStats =
      searchParams.get("syncStats") === "1" || searchParams.get("syncStats") === "true";
    const schools = syncStats ? await listSchoolsWithSyncStats() : await listSchools();
    return NextResponse.json({ data: schools });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const payload = await request.json();
    const school = await createSchool(schoolCreateSchema.parse(payload));
    return NextResponse.json({ data: school }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
