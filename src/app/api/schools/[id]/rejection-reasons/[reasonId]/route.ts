import { NextResponse } from "next/server";

import { requireApiSession, requireSchoolAccess } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/services/errors";
import { rejectionReasonUpdateSchema } from "@/services/validation";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().min(1), reasonId: z.string().min(1) });
type Params = { params: Promise<{ id: string; reasonId: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { id: schoolId, reasonId } = paramsSchema.parse(await params);
    await requireSchoolAccess(session, schoolId, "canManageTemplates");
    const existing = await prisma.rejectionReason.findFirst({
      where: { id: reasonId, schoolId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("Причину відхилення не знайдено");
    const payload = await request.json();
    const parsed = rejectionReasonUpdateSchema.parse(payload);
    const reason = await prisma.rejectionReason.update({
      where: { id: reasonId },
      data: {
        ...(parsed.label !== undefined ? { label: parsed.label } : {}),
        ...(parsed.messageText !== undefined ? { messageText: parsed.messageText } : {}),
        ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {}),
      },
    });
    return NextResponse.json({ data: reason });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const session = await requireApiSession(["admin", "manager"]);
    const { id: schoolId, reasonId } = paramsSchema.parse(await params);
    await requireSchoolAccess(session, schoolId, "canManageTemplates");
    const existing = await prisma.rejectionReason.findFirst({
      where: { id: reasonId, schoolId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("Причину відхилення не знайдено");
    await prisma.rejectionReason.delete({ where: { id: reasonId } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
