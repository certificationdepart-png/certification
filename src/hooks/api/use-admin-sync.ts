"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchMetrics, fetchSyncJobs } from "@/lib/admin-fetchers";
import { readApiJson } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import { queryKeys } from "@/lib/query-keys";
import { invalidateSyncScope } from "@/lib/query-invalidate";

export function syncJobsQueryKey(schoolFilter: string, statusFilter: string) {
  return `${schoolFilter}|${statusFilter}`;
}

export function useSyncJobsQuery(schoolFilter: string, statusFilter: string) {
  const key = syncJobsQueryKey(schoolFilter, statusFilter);
  return useQuery({
    queryKey: queryKeys.syncJobs.list(key),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (schoolFilter) params.set("schoolId", schoolFilter);
      if (statusFilter) params.set("status", statusFilter);
      return fetchSyncJobs(params);
    },
  });
}

export function useSyncPageMetricsQuery() {
  return useQuery({
    queryKey: queryKeys.metrics.all,
    queryFn: fetchMetrics,
  });
}

export function useSyncJobRetryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(apiRoutes.syncJobRetry(jobId), { method: "POST" });
      return readApiJson<{ processed?: boolean } & Record<string, unknown>>(res);
    },
    onSettled: () => void invalidateSyncScope(qc),
  });
}
