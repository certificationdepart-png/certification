import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { idParamSchema } from "@/lib/api-validation";
import { getApplicationChatHistory } from "@/services/applications.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireApiSession();
    const { id } = idParamSchema.parse(await params);
    const history = await getApplicationChatHistory(id);
    return NextResponse.json({ data: history });
  } catch (error) {
    return handleRouteError(error);
  }
}
