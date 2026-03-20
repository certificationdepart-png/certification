"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSyncJobs, type SyncJobRow } from "@/lib/admin-fetchers";
import { formatDateTime } from "@/lib/format-datetime";
import { routes } from "@/lib/routes";
import {
  useSchoolOptionsQuery,
  useSchoolsSyncAllMutation,
  useSyncJobRetryMutation,
  useSyncJobsQuery,
  useSyncPageMetricsQuery,
} from "@/hooks/api";
import { ApiError } from "@/lib/api-http";

type School = { id: string; name: string };

type Stats = Record<string, number>;
type MetricsSnapshot = {
  syncQueue?: Record<string, number>;
  outboxQueue?: Record<string, number>;
  runtime?: {
    histograms?: {
      webhookLatencyMs?: { avg: number; p95: number; samples: number };
    };
  };
};

const SYNC_TABLE_HEADINGS = [
  "Школа",
  "Заявка",
  "Статус",
  "Спроби",
  "Помилка",
  "Створено",
  "",
] as const;

function SyncJobsTableSkeleton({ rowCount = 6 }: { rowCount?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {SYNC_TABLE_HEADINGS.map((h) => (
              <th key={h || "actions"} className="px-2 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, i) => (
            <tr key={i} className="border-b">
              {SYNC_TABLE_HEADINGS.map((_, j) => (
                <td key={j} className="px-2 py-2">
                  <Skeleton
                    className={
                      j === 4
                        ? "h-4 w-32 max-w-[12rem]"
                        : j === SYNC_TABLE_HEADINGS.length - 1
                          ? "h-8 w-16"
                          : "h-4 w-24"
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SyncClient({
  schools: initialSchools,
  initialSchoolId = "",
}: {
  schools: School[];
  initialSchoolId?: string;
}) {
  const { data: schools = initialSchools } = useSchoolOptionsQuery(initialSchools);
  const [schoolFilter, setSchoolFilter] = useState<string>(initialSchoolId);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState<string | null>(null);

  const [syncProgressTotalPending, setSyncProgressTotalPending] = useState<number | null>(null);
  const [syncProgressPending, setSyncProgressPending] = useState<number>(0);
  const [syncProgressProcessing, setSyncProgressProcessing] = useState<number>(0);
  const [syncProgressCompleted, setSyncProgressCompleted] = useState<number>(0);
  const [syncProgressFailed, setSyncProgressFailed] = useState<number>(0);
  const [syncProgressStartDone, setSyncProgressStartDone] = useState<number>(0);

  const {
    data: jobsPayload,
    isFetching: jobsLoading,
    refetch: refetchJobs,
  } = useSyncJobsQuery(schoolFilter, statusFilter);
  const { data: metricsRaw, refetch: refetchMetrics } = useSyncPageMetricsQuery();
  const metrics = metricsRaw as MetricsSnapshot | undefined;
  const retryJob = useSyncJobRetryMutation();
  const syncAllSchool = useSchoolsSyncAllMutation();

  const jobs: SyncJobRow[] = jobsPayload?.data ?? [];
  const stats: Stats = jobsPayload?.stats ?? {};
  const loading = jobsLoading;

  async function handleRetry(jobId: string) {
    setRetrying(jobId);
    try {
      const payload = await retryJob.mutateAsync(jobId);
      toast.success(payload.processed ? "Синхронізовано" : "Задачу додано в чергу");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Помилка");
    } finally {
      setRetrying(null);
    }
  }

  async function handleSyncAll(schoolId: string) {
    setSyncingAll(schoolId);
    setSyncProgressTotalPending(null);
    setSyncProgressPending(0);
    setSyncProgressProcessing(0);
    setSyncProgressCompleted(0);
    setSyncProgressFailed(0);
    setSyncProgressStartDone(0);
    try {
      // Snapshot initial counts for progress bar.
      const params = new URLSearchParams();
      params.set("schoolId", schoolId);
      const initial = await fetchSyncJobs(params);

      const initialPending = initial.stats.pending ?? 0;
      setSyncProgressTotalPending(initialPending);
      setSyncProgressPending(initialPending);
      setSyncProgressProcessing(initial.stats.processing ?? 0);
      setSyncProgressCompleted(initial.stats.completed ?? 0);
      setSyncProgressFailed(initial.stats.failed ?? 0);
      setSyncProgressStartDone(
        (initial.stats.completed ?? 0) + (initial.stats.failed ?? 0),
      );

      const payload = await syncAllSchool.mutateAsync(schoolId);
      toast.success(`Додано в чергу: ${payload.enqueued ?? 0} заявок`);
      // Ensure the table refreshes even if query invalidation doesn't match
      // the current filter key.
      await Promise.all([refetchJobs(), refetchMetrics()]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Помилка");
    } finally {
      setSyncingAll(null);
    }
  }

  useEffect(() => {
    if (!syncingAll) return;

    let cancelled = false;
    const schoolId = syncingAll;

    const poll = async () => {
      try {
        const params = new URLSearchParams();
        params.set("schoolId", schoolId);
        const res = await fetchSyncJobs(params);
        if (cancelled) return;

        setSyncProgressPending(res.stats.pending ?? 0);
        setSyncProgressProcessing(res.stats.processing ?? 0);
        setSyncProgressCompleted(res.stats.completed ?? 0);
        setSyncProgressFailed(res.stats.failed ?? 0);
      } catch {
        // ignore polling errors
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [syncingAll]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Синхронізація з Google Sheets</h1>
      <Card>
        <CardHeader>
          <CardTitle>Операційні метрики</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Sync pending: {metrics?.syncQueue?.pending ?? 0}</div>
          <div>Sync failed: {metrics?.syncQueue?.failed ?? 0}</div>
          <div>Outbox pending: {metrics?.outboxQueue?.pending ?? 0}</div>
          <div>Outbox failed: {metrics?.outboxQueue?.failed ?? 0}</div>
          <div>Webhook latency avg: {metrics?.runtime?.histograms?.webhookLatencyMs?.avg ?? 0} ms</div>
          <div>Webhook latency p95: {metrics?.runtime?.histograms?.webhookLatencyMs?.p95 ?? 0} ms</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <select
            className="rounded border px-3 py-2 text-sm"
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
          >
            <option value="">Всі школи</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Всі статуси</option>
            <option value="pending">Очікує</option>
            <option value="completed">Виконано</option>
            <option value="failed">Помилка</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchJobs();
              void refetchMetrics();
            }}
            disabled={loading}
          >
            Оновити
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Черга sync jobs</CardTitle>
          <div className="flex gap-2">
            {schools.map((s) => (
              <Button
                key={s.id}
                variant="outline"
                size="sm"
                disabled={syncingAll !== null}
                onClick={() => void handleSyncAll(s.id)}
              >
                {syncingAll === s.id ? "..." : `Re-sync ${s.name}`}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {syncingAll && syncProgressTotalPending !== null && syncProgressTotalPending > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Прогрес для {schools.find((s) => s.id === syncingAll)?.name ?? "школи"}
                </span>
                <span>
                  {Math.max(
                    0,
                    syncProgressCompleted + syncProgressFailed - syncProgressStartDone,
                  )}
                  /{syncProgressTotalPending} виконано
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-muted/40">
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{
                    width: `${
                      Math.min(
                        100,
                        Math.max(
                          0,
                          ((Math.max(0, syncProgressCompleted + syncProgressFailed - syncProgressStartDone) /
                            syncProgressTotalPending) *
                            100),
                        ),
                      )
                    }%`,
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>pending: {syncProgressPending}</span>
                <span>processing: {syncProgressProcessing}</span>
                <span>completed: {syncProgressCompleted}</span>
                <span>failed: {syncProgressFailed}</span>
              </div>
            </div>
          )}
          <div className="mb-4 flex gap-4 text-sm text-muted-foreground">
            {Object.entries(stats).map(([st, count]) => (
              <span key={st}>
                {st}: {count}
              </span>
            ))}
          </div>
          {loading ? (
            <SyncJobsTableSkeleton />
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground">Немає записів</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left">Школа</th>
                    <th className="px-2 py-2 text-left">Заявка</th>
                    <th className="px-2 py-2 text-left">Статус</th>
                    <th className="px-2 py-2 text-left">Спроби</th>
                    <th className="px-2 py-2 text-left">Помилка</th>
                    <th className="px-2 py-2 text-left">Створено</th>
                    <th className="px-2 py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b">
                      <td className="px-2 py-2">{job.school.name}</td>
                      <td className="px-2 py-2">
                        <a
                          href={routes.admin.applicationDetail(job.application.id)}
                          className="text-primary hover:underline"
                        >
                          {job.application.studentNameUa} ({job.application.id.slice(0, 8)})
                        </a>
                      </td>
                      <td className="px-2 py-2">{job.status}</td>
                      <td className="px-2 py-2">{job.attemptCount}</td>
                      <td className="max-w-48 truncate px-2 py-2 text-red-600" title={job.lastError ?? ""}>
                        {job.lastError ?? "—"}
                      </td>
                      <td className="px-2 py-2">{formatDateTime(job.createdAt)}</td>
                      <td className="px-2 py-2">
                        {job.status !== "completed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retrying !== null}
                            onClick={() => void handleRetry(job.id)}
                          >
                            {retrying === job.id ? "..." : "Retry"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
