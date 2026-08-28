"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchManagers, type ManagerWithAccess } from "@/lib/admin-fetchers";
import { readApiJson } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import { queryKeys } from "@/lib/query-keys";

export function useManagersQuery(initialData?: ManagerWithAccess[]) {
  return useQuery({
    queryKey: queryKeys.managers.list(),
    queryFn: fetchManagers,
    initialData,
  });
}

export function useUpdateManagerAccessMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      grants,
    }: {
      userId: string;
      grants: Array<{
        schoolId: string;
        canViewApplications: boolean;
        canManageApplications: boolean;
        canDeleteApplications: boolean;
        canEditSchool: boolean;
        canManageCourses: boolean;
        canManageTemplates: boolean;
        canManageSync: boolean;
        canCreateSchool: boolean;
      }>;
    }) => {
      const res = await fetch(apiRoutes.managerById(userId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grants }),
      });
      return readApiJson<{ data: unknown }>(res);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.managers.all }),
  });
}

export function useRevokeManagerAccessMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(apiRoutes.managerById(userId), { method: "DELETE" });
      return readApiJson<{ data: unknown }>(res);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.managers.all }),
  });
}
