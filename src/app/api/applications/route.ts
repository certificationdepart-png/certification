import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { parseApplicationsListQuery } from "@/lib/api-validation";
import { listApplications } from "@/services/applications.service";

export async function GET(request: Request) {
  try {
    await requireApiSession();
    const query = parseApplicationsListQuery(request);
    const statusArr = query.status
      ? Array.isArray(query.status)
        ? query.status
        : [query.status]
      : undefined;
    const result = await listApplications({
      schoolId: query.schoolId,
      status: statusArr,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    });
    return NextResponse.json({ data: result.data, total: result.total, page: result.page, pageSize: result.pageSize });
  } catch (error) {
    return handleRouteError(error);
  }
}
