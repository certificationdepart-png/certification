import { SyncClient } from "@/app/(admin)/sync/sync-client";
import { prisma } from "@/lib/db";

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolId?: string }>;
}) {
  const { schoolId } = await searchParams;
  const schools = await prisma.school.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const initialSchoolId =
    schoolId && schools.some((s) => s.id === schoolId) ? schoolId : "";

  return <SyncClient schools={schools} initialSchoolId={initialSchoolId} />;
}
