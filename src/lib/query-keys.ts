/** Central TanStack Query keys — use `invalidateQueries({ queryKey: queryKeys.*.all })` for related refetches. */

export const queryKeys = {
  schools: {
    all: ["schools"] as const,
    options: () => [...queryKeys.schools.all, "options"] as const,
    adminList: () => [...queryKeys.schools.all, "admin-list"] as const,
  },
  courses: {
    all: ["courses"] as const,
    bySchool: (schoolId: string) => [...queryKeys.courses.all, schoolId] as const,
  },
  templates: {
    all: ["templates"] as const,
    bySchool: (schoolId: string) => [...queryKeys.templates.all, schoolId] as const,
  },
  applications: {
    all: ["applications"] as const,
    list: (paramsKey: string) => [...queryKeys.applications.all, "list", paramsKey] as const,
    detail: (id: string) => [...queryKeys.applications.all, "detail", id] as const,
  },
  syncJobs: {
    all: ["syncJobs"] as const,
    list: (paramsKey: string) => [...queryKeys.syncJobs.all, paramsKey] as const,
  },
  metrics: {
    all: ["metrics"] as const,
  },
  health: {
    all: ["health"] as const,
  },
} as const;
