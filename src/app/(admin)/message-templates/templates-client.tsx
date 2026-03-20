"use client";

import { useState } from "react";

import type { SchoolOption, TemplateRow } from "@/components/schools/school-admin-types";
import { TemplatesSection } from "@/components/schools/templates-section";
import { useSchoolOptionsQuery } from "@/hooks/api";

export function MessageTemplatesClient({
  initialSchools,
  initialSchoolId,
  initialTemplates,
}: {
  initialSchools: SchoolOption[];
  initialSchoolId: string;
  initialTemplates: TemplateRow[];
}) {
  const { data: schools = initialSchools } = useSchoolOptionsQuery(initialSchools);
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchoolId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Шаблони повідомлень</h1>
        <p className="text-muted-foreground text-sm">
          Тексти кроків бота та листів після схвалення — по черзі, як у сценарії. Кнопка «Додати типові» створює усі
          стандартні записи з типовим текстом; далі редагуйте під школу.
        </p>
      </div>
      <TemplatesSection
        schools={schools}
        selectedSchoolId={selectedSchoolId}
        initialTemplates={initialTemplates}
        initialTemplatesSchoolId={initialSchoolId}
        hideSchoolSelect={false}
        onSchoolChange={(id) => setSelectedSchoolId(id)}
      />
    </div>
  );
}
