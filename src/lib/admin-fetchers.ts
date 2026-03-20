import { apiRoutes } from "@/lib/api-routes";
import { readApiJson } from "@/lib/api-http";

import type { CourseRow } from "@/components/schools/school-admin-types";
import type { SchoolListRow, SchoolOption, TemplateRow } from "@/components/schools/school-admin-types";
import type { ApplicationListItem } from "@/components/applications/applications-board/applications-types";

export async function fetchSchoolOptions(): Promise<SchoolOption[]> {
  const res = await fetch(apiRoutes.schools);
  const json = await readApiJson<{ data: Array<{ id: string; name: string }> }>(res);
  return [...json.data]
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));
}

export async function fetchSchoolsAdminList(): Promise<SchoolListRow[]> {
  const res = await fetch(`${apiRoutes.schools}?syncStats=1`);
  const json = await readApiJson<{ data: SchoolListRow[] }>(res);
  return json.data ?? [];
}

export async function fetchCoursesForSchool(schoolId: string): Promise<CourseRow[]> {
  const res = await fetch(`${apiRoutes.courses}?schoolId=${encodeURIComponent(schoolId)}`);
  const json = await readApiJson<{ data: CourseRow[] }>(res);
  return json.data ?? [];
}

export async function fetchTemplatesForSchool(schoolId: string): Promise<TemplateRow[]> {
  const res = await fetch(`${apiRoutes.messageTemplates}?schoolId=${encodeURIComponent(schoolId)}`);
  const json = await readApiJson<{ data: TemplateRow[] }>(res);
  return json.data ?? [];
}

export type ApplicationsListResult = {
  data: ApplicationListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export async function fetchApplicationsList(searchParams: URLSearchParams): Promise<ApplicationsListResult> {
  const res = await fetch(`${apiRoutes.applications}?${searchParams}`);
  const json = await readApiJson<{
    data: ApplicationListItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(res);
  return {
    data: json.data ?? [],
    total: json.total ?? 0,
    page: json.page ?? 1,
    pageSize: json.pageSize ?? 20,
  };
}

export type SyncJobRow = {
  id: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
  school: { id: string; name: string };
  application: {
    id: string;
    studentNameUa: string;
    status: string;
    externalRowId: number | null;
  };
};

export async function fetchSyncJobs(searchParams: URLSearchParams): Promise<{
  data: SyncJobRow[];
  stats: Record<string, number>;
}> {
  const res = await fetch(`${apiRoutes.syncJobs}?${searchParams}`);
  const json = await readApiJson<{ data: SyncJobRow[]; stats: Record<string, number> }>(res);
  return { data: json.data ?? [], stats: json.stats ?? {} };
}

export type MetricsSnapshot = {
  syncQueue?: Record<string, number>;
  outboxQueue?: Record<string, number>;
  runtime?: {
    histograms?: {
      webhookLatencyMs?: { avg: number; p95: number; samples: number };
    };
  };
};

export async function fetchMetrics(): Promise<MetricsSnapshot> {
  const res = await fetch(apiRoutes.metrics, { cache: "no-store" });
  const json = await readApiJson<MetricsSnapshot & Record<string, unknown>>(res);
  return json;
}

export type HealthResponse = {
  ok: boolean;
  status: "healthy" | "degraded";
  appVersion: string;
  environment: string;
  database: string;
  checks?: {
    dbLatencyMs: number;
    pendingSyncJobs: number;
    failedSyncJobs: number;
    pendingOutboxEvents: number;
    failedOutboxEvents: number;
  };
};

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(apiRoutes.health, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Health check failed");
  }
  return (await res.json()) as HealthResponse;
}

export async function fetchApplicationDetail(applicationId: string): Promise<unknown> {
  const res = await fetch(apiRoutes.applicationById(applicationId));
  const json = await readApiJson<{ data: unknown }>(res);
  return json.data;
}
