"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchTemplatesForSchool } from "@/lib/admin-fetchers";
import { readApiJson } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import { queryKeys } from "@/lib/query-keys";
import { invalidateTemplatesScope } from "@/lib/query-invalidate";

import type { TemplateRow } from "@/components/schools/school-admin-types";

export function useTemplatesQuery(
  schoolId: string,
  opts?: { initialData?: TemplateRow[]; initialSchoolId?: string },
) {
  const matchesInitial = Boolean(opts?.initialSchoolId) && opts?.initialSchoolId === schoolId;
  return useQuery({
    queryKey: queryKeys.templates.bySchool(schoolId),
    queryFn: () => fetchTemplatesForSchool(schoolId),
    enabled: schoolId.length > 0,
    initialData: matchesInitial ? opts?.initialData : undefined,
  });
}

export function useCreateTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { schoolId: string } & Record<string, unknown>) => {
      const res = await fetch(apiRoutes.messageTemplates, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readApiJson<Record<string, unknown>>(res);
    },
    onSettled: (_d, _e, vars) => {
      if (vars?.schoolId) void invalidateTemplatesScope(qc, vars.schoolId);
    },
  });
}

export function usePatchTemplateMutation(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, body }: { templateId: string; body: unknown }) => {
      const res = await fetch(
        `${apiRoutes.messageTemplateById(templateId)}?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return readApiJson<Record<string, unknown>>(res);
    },
    onSettled: () => void invalidateTemplatesScope(qc, schoolId),
  });
}

export function useDeleteTemplateMutation(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(
        `${apiRoutes.messageTemplateById(templateId)}?schoolId=${encodeURIComponent(schoolId)}`,
        { method: "DELETE" },
      );
      await readApiJson<Record<string, unknown>>(res);
    },
    onSettled: () => void invalidateTemplatesScope(qc, schoolId),
  });
}
