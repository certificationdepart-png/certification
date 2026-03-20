import { CoursesClient } from "@/app/(admin)/courses/courses-client";
import { prisma } from "@/lib/db";

export default async function CoursesPage() {
  const schools = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  const selectedSchoolId = schools[0]?.id;
  const courses = selectedSchoolId
    ? await prisma.course.findMany({ where: { schoolId: selectedSchoolId }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <CoursesClient initialSchools={schools} initialSchoolId={selectedSchoolId ?? ""} initialCourses={courses} />
  );
}
