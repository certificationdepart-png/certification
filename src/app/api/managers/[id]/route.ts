import { NextResponse } from "next/server";

import { requireApiAdminSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { revokeAllManagerAccess, setManagerAccess } from "@/services/managers.service";
import { managerAccessUpdateSchema } from "@/services/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireApiAdminSession();
    const { id } = idParamSchema.parse(await params);
    const payload = await request.json();
    const { grants } = managerAccessUpdateSchema.parse(payload);
    await setManagerAccess(id, grants);
    return NextResponse.json({ data: { updated: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    await requireApiAdminSession();
    const { id } = idParamSchema.parse(await params);
    await revokeAllManagerAccess(id);
    return NextResponse.json({ data: { revoked: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
