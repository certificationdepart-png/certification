import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export async function GET() {
  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";

  try {
    const session = await auth.api.getSession({ headers: h });
    const user = (session?.user ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      hasSession: Boolean(session?.session),
      user: {
        id: user.id,
        userId: user.userId,
        sub: user.sub,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      cookieHeaderPresent: Boolean(cookieHeader),
      cookieHeaderMentionsBetterAuth: /better-auth/i.test(cookieHeader),
    });
  } catch (e) {
    return NextResponse.json(
      {
        hasSession: false,
        error: e instanceof Error ? e.message : String(e),
        cookieHeaderPresent: Boolean(cookieHeader),
        cookieHeaderMentionsBetterAuth: /better-auth/i.test(cookieHeader),
      },
      { status: 500 },
    );
  }
}

