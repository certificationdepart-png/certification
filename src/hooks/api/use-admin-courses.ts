"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchCoursesForSchool } from "@/lib/admin-fetchers";
import { readApiJson } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import { queryKeys } from "@/lib/query-keys";
import { invalidateCoursesScope } from "@/lib/query-invalidate";

import type { CourseRow } from "@/components/schools/school-admin-types";

export function useCoursesQuery(
  schoolId: string,
  opts?: { initialData?: CourseRow[]; initialSchoolId?: string },
) {
  const matchesInitial = Boolean(opts?.initialSchoolId) && opts?.initialSchoolId === schoolId;
  return useQuery({
    queryKey: queryKeys.courses.bySchool(schoolId),
    queryFn: () => fetchCoursesForSchool(schoolId),
    enabled: schoolId.length > 0,
    initialData: matchesInitial ? opts?.initialData : undefined,
  });
}

export function useCreateCourseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { schoolId: string } & Record<string, unknown>) => {
      const res = await fetch(apiRoutes.courses, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readApiJson<Record<string, unknown>>(res);
    },
    onSettled: (_d, _e, vars) => {
      if (vars?.schoolId) void invalidateCoursesScope(qc, vars.schoolId);
    },
  });
}

export function usePatchCourseMutation(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, body }: { courseId: string; body: unknown }) => {
      const res = await fetch(`${apiRoutes.courseById(courseId)}?schoolId=${encodeURIComponent(schoolId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readApiJson<Record<string, unknown>>(res);
    },
    onSettled: () => void invalidateCoursesScope(qc, schoolId),
  });
}

export function useDeleteCourseMutation(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (courseId: string) => {
      const res = await fetch(`${apiRoutes.courseById(courseId)}?schoolId=${encodeURIComponent(schoolId)}`, {
        method: "DELETE",
      });
      await readApiJson<Record<string, unknown>>(res);
    },
    onSettled: () => void invalidateCoursesScope(qc, schoolId),
  });
}
