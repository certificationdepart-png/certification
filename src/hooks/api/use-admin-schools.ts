"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchSchoolOptions, fetchSchoolsAdminList } from "@/lib/admin-fetchers";
import { readApiJson } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import { queryKeys } from "@/lib/query-keys";
import { invalidateSchoolScope, invalidateSyncScope } from "@/lib/query-invalidate";

import type { SchoolListRow, SchoolOption } from "@/components/schools/school-admin-types";

export function useSchoolOptionsQuery(initialData?: SchoolOption[]) {
  return useQuery({
    queryKey: queryKeys.schools.options(),
    queryFn: fetchSchoolOptions,
    initialData,
  });
}

export function useSchoolsAdminListQuery(initialData?: SchoolListRow[]) {
  return useQuery({
    queryKey: queryKeys.schools.adminList(),
    queryFn: fetchSchoolsAdminList,
    initialData,
  });
}

export function useCreateSchoolMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: unknown) => {
      const res = await fetch(apiRoutes.schools, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readApiJson<{ data: Record<string, unknown> }>(res);
      return json.data;
    },
    onSettled: () => void invalidateSchoolScope(qc),
  });
}

export function useDeleteSchoolMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiRoutes.schoolById(id), { method: "DELETE" });
      await readApiJson<Record<string, unknown>>(res);
    },
    onSettled: () => void invalidateSchoolScope(qc),
  });
}

export function useUpdateSchoolMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ schoolId, body }: { schoolId: string; body: unknown }) => {
      const res = await fetch(apiRoutes.schoolById(schoolId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readApiJson<{ data: unknown }>(res);
    },
    onSettled: () => void invalidateSchoolScope(qc),
  });
}

export function useSchoolsSyncAllMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (schoolId: string) => {
      const res = await fetch(apiRoutes.schoolsSyncAll(schoolId), { method: "POST" });
      return readApiJson<{ enqueued?: number } & Record<string, unknown>>(res);
    },
    onSettled: () => void invalidateSyncScope(qc),
  });
}
