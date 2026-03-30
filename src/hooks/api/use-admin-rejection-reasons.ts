"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { readApiJson } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import { queryKeys } from "@/lib/query-keys";

export type RejectionReasonRow = {
  id: string;
  schoolId: string;
  label: string;
  messageText: string;
  sortOrder: number;
};

export function useRejectionReasonsQuery(schoolId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.rejectionReasons.bySchool(schoolId),
    queryFn: async () => {
      const res = await fetch(apiRoutes.schoolRejectionReasons(schoolId));
      return readApiJson<{ data: RejectionReasonRow[] }>(res);
    },
    enabled: schoolId.length > 0 && (options?.enabled ?? true),
  });
}

export function useCreateRejectionReasonMutation(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { label: string; messageText: string; sortOrder?: number }) => {
      const res = await fetch(apiRoutes.schoolRejectionReasons(schoolId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readApiJson<{ data: RejectionReasonRow }>(res);
    },
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.rejectionReasons.bySchool(schoolId) }),
  });
}

export function useUpdateRejectionReasonMutation(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reasonId,
      body,
    }: {
      reasonId: string;
      body: { label?: string; messageText?: string; sortOrder?: number };
    }) => {
      const res = await fetch(apiRoutes.schoolRejectionReasonById(schoolId, reasonId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readApiJson<{ data: RejectionReasonRow }>(res);
    },
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.rejectionReasons.bySchool(schoolId) }),
  });
}

export function useDeleteRejectionReasonMutation(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reasonId: string) => {
      const res = await fetch(apiRoutes.schoolRejectionReasonById(schoolId, reasonId), {
        method: "DELETE",
      });
      return readApiJson<{ data: { deleted: boolean } }>(res);
    },
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.rejectionReasons.bySchool(schoolId) }),
  });
}
