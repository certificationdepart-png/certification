import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    await requireApiSession();

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

    const where: { schoolId?: string; status?: string } = {};
    if (schoolId) where.schoolId = schoolId;
    if (status) where.status = status;

    const jobs = await prisma.syncJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        school: { select: { id: true, name: true } },
        application: {
          select: {
            id: true,
            studentNameUa: true,
            status: true,
            externalRowId: true,
          },
        },
      },
    });

    const stats = await prisma.syncJob.groupBy({
      by: ["status"],
      where: schoolId ? { schoolId } : undefined,
      _count: true,
    });

    return NextResponse.json({
      data: jobs,
      stats: Object.fromEntries(stats.map((s) => [s.status, s._count])),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
