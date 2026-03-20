import { notFound } from "next/navigation";

import { SchoolSetupClient } from "@/app/(admin)/schools/[id]/school-setup-client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/services/errors";
import { getSchoolById } from "@/services/schools.service";

type Params = { params: Promise<{ id: string }> };

export default async function SchoolDetailPage({ params }: Params) {
  const { id } = await params;

  let school;
  try {
    school = await getSchoolById(id);
  } catch (e) {
    if (e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  const [courses, templates] = await Promise.all([
    prisma.course.findMany({
      where: { schoolId: id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.messageTemplate.findMany({
      where: { schoolId: id },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <SchoolSetupClient
      school={{
        id: school.id,
        name: school.name,
        schoolKey: school.schoolKey,
        telegramChatId: school.telegramChatId,
        googleSheetUrl: school.googleSheetUrl,
        hasTelegramBotToken: school.hasTelegramBotToken,
        hasNovaPoshtaApiKey: school.hasNovaPoshtaApiKey,
      }}
      initialCourses={courses}
      initialTemplates={templates}
    />
  );
}
