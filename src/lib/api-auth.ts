import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError } from "@/services/errors";

const ADMIN_ROLES = new Set(["admin", "manager"]);

export async function requireApiSession(requiredRoles: string[] = ["admin"]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session) {
    throw new UnauthorizedError();
  }
  const role = (session.user as unknown as { role?: string | null }).role ?? "user";
  if (requiredRoles.length > 0 && !requiredRoles.includes(role)) {
    throw new ForbiddenError();
  }
  return session;
}

export async function requireApiAdminSession() {
  return requireApiSession(["admin"]);
}

export function isAdminRole(role?: string | null) {
  return ADMIN_ROLES.has(role ?? "");
}
