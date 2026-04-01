import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

export type SchoolPermission =
  | "canViewApplications"
  | "canDeleteApplications"
  | "canEditSchool"
  | "canAddSchool"
  | "canAddCourses";

type ResolvedSession = Awaited<ReturnType<typeof requireApiSession>>;

function getRole(session: ResolvedSession): string {
  return (session.user as unknown as { role?: string | null }).role ?? "user";
}

/** Check school-scoped permission. Admins bypass; managers must have a matching access row. */
export async function requireSchoolAccess(
  session: ResolvedSession,
  schoolId: string,
  permission: SchoolPermission,
): Promise<void> {
  if (getRole(session) === "admin") return;
  const access = await prisma.schoolManagerAccess.findUnique({
    where: { userId_schoolId: { userId: session.user.id, schoolId } },
    select: { [permission]: true },
  });
  if (!access || !access[permission as keyof typeof access]) throw new ForbiddenError();
}

/** Check if user has canAddSchool on any of their access rows (global capability). */
export async function requireCanAddSchool(session: ResolvedSession): Promise<void> {
  if (getRole(session) === "admin") return;
  const access = await prisma.schoolManagerAccess.findFirst({
    where: { userId: session.user.id, canAddSchool: true },
    select: { id: true },
  });
  if (!access) throw new ForbiddenError();
}

/** Returns school IDs the user has any access to. Admins get null (meaning all schools). */
export async function getAccessibleSchoolIds(session: ResolvedSession): Promise<string[] | null> {
  if (getRole(session) === "admin") return null;
  const rows = await prisma.schoolManagerAccess.findMany({
    where: { userId: session.user.id },
    select: { schoolId: true },
  });
  return rows.map((r) => r.schoolId);
}
