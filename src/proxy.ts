import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { routes } from "@/lib/routes";

// Fast unauthenticated redirect for Next.js 16+ proxy.
// Authorization (including role checks) is still handled in the pages/layouts.
export async function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL(routes.public.login, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Next.js requires these to be static at build-time.
    "/dashboard",
    "/dashboard/:path*",
  ],
};

