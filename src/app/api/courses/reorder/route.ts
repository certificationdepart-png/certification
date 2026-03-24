import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { reorderCourses } from "@/services/courses.service";

const reorderSchema = z.object({
  schoolId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const payload = await request.json();
    const { schoolId, orderedIds } = reorderSchema.parse(payload);
    await reorderCourses({ schoolId, orderedIds });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
