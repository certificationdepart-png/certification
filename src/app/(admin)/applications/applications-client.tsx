"use client";

import { ApplicationsBoardClient } from "@/components/applications/applications-board/applications-board-client";
import type { SchoolOption } from "@/components/applications/applications-board/applications-types";
import { useSchoolOptionsQuery } from "@/hooks/api";

export function ApplicationsClient({ initialSchools }: { initialSchools: SchoolOption[] }) {
  const { data: schools = initialSchools } = useSchoolOptionsQuery(initialSchools);
  return <ApplicationsBoardClient schools={schools} />;
}
