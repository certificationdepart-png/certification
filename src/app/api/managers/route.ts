import { NextResponse } from "next/server";

import { requireApiAdminSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { listManagersWithAccess } from "@/services/managers.service";

export async function GET() {
  try {
    await requireApiAdminSession();
    const managers = await listManagersWithAccess();
    return NextResponse.json({ data: managers });
  } catch (error) {
    return handleRouteError(error);
  }
}
