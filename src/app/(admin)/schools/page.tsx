import { SchoolsClient } from "@/app/(admin)/schools/schools-client";
import type { SchoolListRow } from "@/components/schools/school-admin-types";
import { listSchoolsWithSyncStats } from "@/services/schools.service";

export default async function SchoolsPage() {
  const schools = await listSchoolsWithSyncStats();
  const initialSchools: SchoolListRow[] = schools.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return <SchoolsClient initialSchools={initialSchools} />;
}
