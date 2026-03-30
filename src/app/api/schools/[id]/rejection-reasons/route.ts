import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { prisma } from "@/lib/db";
import { rejectionReasonCreateSchema } from "@/services/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    await requireApiSession();
    const { id: schoolId } = idParamSchema.parse(await params);
    const reasons = await prisma.rejectionReason.findMany({
      where: { schoolId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ data: reasons });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const { id: schoolId } = idParamSchema.parse(await params);
    const payload = await request.json();
    const parsed = rejectionReasonCreateSchema.parse(payload);
    const reason = await prisma.rejectionReason.create({
      data: {
        schoolId,
        label: parsed.label,
        messageText: parsed.messageText,
        sortOrder: parsed.sortOrder ?? 0,
      },
    });
    return NextResponse.json({ data: reason }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
