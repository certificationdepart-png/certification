"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchHealth, fetchMetrics } from "@/lib/admin-fetchers";
import { queryKeys } from "@/lib/query-keys";

export function useAdminHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health.all,
    queryFn: fetchHealth,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useAdminMetricsQuery() {
  return useQuery({
    queryKey: queryKeys.metrics.all,
    queryFn: fetchMetrics,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}
