import { headers } from "next/headers";

import { SchoolsClient } from "@/app/(admin)/schools/schools-client";
import type { SchoolListRow } from "@/components/schools/school-admin-types";
import { auth } from "@/lib/auth";
import { listSchoolsWithSyncStats, listSchoolsWithSyncStatsForUser } from "@/services/schools.service";

export default async function SchoolsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as unknown as { role?: string | null })?.role ?? "user";
  const isAdmin = role === "admin";

  const schools = isAdmin
    ? await listSchoolsWithSyncStats()
    : await listSchoolsWithSyncStatsForUser(session!.user.id);

  const initialSchools: SchoolListRow[] = schools.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return <SchoolsClient initialSchools={initialSchools} canCreate={isAdmin} />;
}
