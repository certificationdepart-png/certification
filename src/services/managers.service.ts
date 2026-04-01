import { prisma } from "@/lib/db";
import { NotFoundError } from "@/services/errors";

export type SchoolAccessGrant = {
  schoolId: string;
  canViewApplications: boolean;
  canDeleteApplications: boolean;
  canEditSchool: boolean;
  canAddSchool: boolean;
  canAddCourses: boolean;
};

export type SchoolAccessWithName = SchoolAccessGrant & {
  schoolName: string;
};

export type ManagerWithAccess = {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolAccess: SchoolAccessWithName[];
};

/** All platform users with their school access grants. */
export async function listManagersWithAccess(): Promise<ManagerWithAccess[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      schoolAccess: {
        select: {
          schoolId: true,
          canViewApplications: true,
          canDeleteApplications: true,
          canEditSchool: true,
          canAddSchool: true,
          canAddCourses: true,
          school: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    schoolAccess: u.schoolAccess.map((a) => ({
      schoolId: a.schoolId,
      schoolName: a.school.name,
      canViewApplications: a.canViewApplications,
      canDeleteApplications: a.canDeleteApplications,
      canEditSchool: a.canEditSchool,
      canAddSchool: a.canAddSchool,
      canAddCourses: a.canAddCourses,
    })),
  }));
}

/** Replace all school access grants for a user atomically. Updates user role accordingly. */
export async function setManagerAccess(
  userId: string,
  grants: SchoolAccessGrant[],
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) throw new NotFoundError("Користувача не знайдено");

  await prisma.$transaction(async (tx) => {
    await tx.schoolManagerAccess.deleteMany({ where: { userId } });

    if (grants.length > 0) {
      await tx.schoolManagerAccess.createMany({
        data: grants.map((g) => ({
          userId,
          schoolId: g.schoolId,
          canViewApplications: g.canViewApplications,
          canDeleteApplications: g.canDeleteApplications,
          canEditSchool: g.canEditSchool,
          canAddSchool: g.canAddSchool,
          canAddCourses: g.canAddCourses,
        })),
      });
    }

    // Keep role = "admin" if already admin; otherwise set "manager" or "user"
    if (user.role !== "admin") {
      await tx.user.update({
        where: { id: userId },
        data: { role: grants.length > 0 ? "manager" : "user" },
      });
    }
  });
}

/** Remove all school access and reset role to "user". */
export async function revokeAllManagerAccess(userId: string): Promise<void> {
  await setManagerAccess(userId, []);
}
