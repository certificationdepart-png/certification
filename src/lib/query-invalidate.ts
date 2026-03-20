import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

/** Schools, courses, templates, applications, sync, metrics (sidebar, dropdowns, queues). */
export async function invalidateSchoolScope(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.schools.all }),
    qc.invalidateQueries({ queryKey: queryKeys.courses.all }),
    qc.invalidateQueries({ queryKey: queryKeys.templates.all }),
    qc.invalidateQueries({ queryKey: queryKeys.applications.all }),
    qc.invalidateQueries({ queryKey: queryKeys.syncJobs.all }),
    qc.invalidateQueries({ queryKey: queryKeys.metrics.all }),
    qc.invalidateQueries({ queryKey: queryKeys.health.all }),
  ]);
}

export async function invalidateCoursesScope(qc: QueryClient, schoolId: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.courses.bySchool(schoolId) }),
    qc.invalidateQueries({ queryKey: queryKeys.applications.all }),
  ]);
}

export async function invalidateTemplatesScope(qc: QueryClient, schoolId: string) {
  await qc.invalidateQueries({ queryKey: queryKeys.templates.bySchool(schoolId) });
}

export async function invalidateApplicationScope(qc: QueryClient, applicationId?: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.applications.all }),
    ...(applicationId
      ? [qc.invalidateQueries({ queryKey: queryKeys.applications.detail(applicationId) })]
      : []),
    qc.invalidateQueries({ queryKey: queryKeys.syncJobs.all }),
    qc.invalidateQueries({ queryKey: queryKeys.metrics.all }),
    qc.invalidateQueries({ queryKey: queryKeys.schools.all }),
    qc.invalidateQueries({ queryKey: queryKeys.health.all }),
  ]);
}

export async function invalidateSyncScope(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.syncJobs.all }),
    qc.invalidateQueries({ queryKey: queryKeys.metrics.all }),
    qc.invalidateQueries({ queryKey: queryKeys.schools.all }),
    qc.invalidateQueries({ queryKey: queryKeys.health.all }),
  ]);
}
