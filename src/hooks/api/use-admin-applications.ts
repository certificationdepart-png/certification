"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchApplicationDetail, fetchApplicationsList } from "@/lib/admin-fetchers";
import { readApiJson } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import { queryKeys } from "@/lib/query-keys";
import { invalidateApplicationScope } from "@/lib/query-invalidate";

export type ApplicationsListArgs = {
  schoolId: string;
  search: string;
  status: string[];
  page: number;
  pageSize: number;
};

export function applicationsListQueryKey(args: ApplicationsListArgs) {
  return JSON.stringify(args);
}

export function useApplicationsListQuery(
  args: ApplicationsListArgs,
  options?: { enabled?: boolean },
) {
  const key = applicationsListQueryKey(args);
  return useQuery({
    queryKey: queryKeys.applications.list(key),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (args.schoolId) params.set("schoolId", args.schoolId);
      if (args.search.trim()) params.set("search", args.search.trim());
      if (args.status.length) params.set("status", args.status.join(","));
      params.set("page", String(args.page));
      params.set("pageSize", String(args.pageSize));
      return fetchApplicationsList(params);
    },
    enabled: options?.enabled ?? true,
  });
}

export function useApplicationDetailQuery(applicationId: string | null, options?: { enabled?: boolean }) {
  const enabled = Boolean(applicationId) && (options?.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.applications.detail(applicationId ?? "__none__"),
    queryFn: () => fetchApplicationDetail(applicationId!),
    enabled: Boolean(applicationId) && enabled,
  });
}

export function usePatchApplicationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, body }: { applicationId: string; body: unknown }) => {
      const res = await fetch(apiRoutes.applicationById(applicationId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readApiJson<{ data: unknown }>(res);
    },
    onSettled: (_d, _e, vars) => void invalidateApplicationScope(qc, vars?.applicationId),
  });
}
