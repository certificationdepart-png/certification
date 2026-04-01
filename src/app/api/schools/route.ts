import { NextResponse } from "next/server";

import { getAccessibleSchoolIds, requireApiSession, requireCanAddSchool } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { schoolCreateSchema } from "@/services/validation";
import {
  createSchool,
  listSchools,
  listSchoolsForUser,
  listSchoolsWithSyncStats,
  listSchoolsWithSyncStatsForUser,
} from "@/services/schools.service";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { searchParams } = new URL(request.url);
    const syncStats =
      searchParams.get("syncStats") === "1" || searchParams.get("syncStats") === "true";

    const accessibleIds = await getAccessibleSchoolIds(session);
    if (accessibleIds === null) {
      // admin — full list
      const schools = syncStats ? await listSchoolsWithSyncStats() : await listSchools();
      return NextResponse.json({ data: schools });
    }
    // manager — scoped list
    const schools = syncStats
      ? await listSchoolsWithSyncStatsForUser(session.user.id)
      : await listSchoolsForUser(session.user.id);
    return NextResponse.json({ data: schools });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    await requireCanAddSchool(session);
    const payload = await request.json();
    const school = await createSchool(schoolCreateSchema.parse(payload));
    return NextResponse.json({ data: school }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
