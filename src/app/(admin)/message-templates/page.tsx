import { MessageTemplatesClient } from "@/app/(admin)/message-templates/templates-client";
import { prisma } from "@/lib/db";

export default async function MessageTemplatesPage() {
  const schools = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  const selectedSchoolId = schools[0]?.id;
  const templates = selectedSchoolId
    ? await prisma.messageTemplate.findMany({
        where: { schoolId: selectedSchoolId },
        orderBy: { code: "asc" },
      })
    : [];

  return (
    <MessageTemplatesClient
      initialSchools={schools}
      initialSchoolId={selectedSchoolId ?? ""}
      initialTemplates={templates}
    />
  );
}
