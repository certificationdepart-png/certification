"use client";

import { useState } from "react";

import { CoursesSection } from "@/components/schools/courses-section";
import type { CourseRow, SchoolOption } from "@/components/schools/school-admin-types";
import { useSchoolOptionsQuery } from "@/hooks/api";

export function CoursesClient({
  initialSchools,
  initialSchoolId,
  initialCourses,
}: {
  initialSchools: SchoolOption[];
  initialSchoolId: string;
  initialCourses: CourseRow[];
}) {
  const { data: schools = initialSchools } = useSchoolOptionsQuery(initialSchools);
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchoolId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Курси</h1>
        <p className="text-muted-foreground text-sm">
          Оберіть школу, перегляньте курси. Новий курс — кнопка «Створити курс» (покроковий майстер); зміни — «Редагувати» в
          списку.
        </p>
      </div>
      <CoursesSection
        schools={schools}
        selectedSchoolId={selectedSchoolId}
        initialCourses={initialCourses}
        initialCoursesSchoolId={initialSchoolId}
        hideSchoolSelect={false}
        onSchoolChange={(id) => setSelectedSchoolId(id)}
      />
    </div>
  );
}
