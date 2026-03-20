"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAdminHealthQuery, useAdminMetricsQuery } from "@/hooks/api";

type HealthResponse = {
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

type MetricsSnapshot = {
  syncQueue?: Record<string, number>;
  outboxQueue?: Record<string, number>;
  runtime?: {
    histograms?: {
      webhookLatencyMs?: { avg: number; p95: number; samples: number };
    };
  };
};

type Tone = "ok" | "warn" | "bad" | "unknown";

function toneFromCounts({
  failed,
  pending,
  pendingWarnThreshold = 100,
}: {
  failed: number;
  pending: number;
  pendingWarnThreshold?: number;
}): Tone {
  if (failed > 0) return "bad";
  if (pending >= pendingWarnThreshold) return "warn";
  if (pending > 0) return "warn";
  return "ok";
}

function toneToClass(tone: Tone) {
  switch (tone) {
    case "ok":
      return "bg-emerald-500";
    case "warn":
      return "bg-amber-500";
    case "bad":
      return "bg-red-500";
    default:
      return "bg-muted-foreground/40";
  }
}

function formatMs(ms: number) {
  if (!Number.isFinite(ms)) return "—";
  return `${Math.round(ms)} ms`;
}

function StatusLight({
  label,
  tone,
  tooltip,
}: {
  label: string;
  tone: Tone;
  tooltip: ReactNode;
}) {
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1">
            <span
              aria-hidden="true"
              className={cn("size-2.5 rounded-full", toneToClass(tone))}
            />
            <span className="text-[11px] font-medium leading-none text-muted-foreground">
              {label}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SystemStatusLights() {
  const { data: healthRaw } = useAdminHealthQuery();
  const { data: metricsRaw } = useAdminMetricsQuery();

  const health = healthRaw as HealthResponse | undefined;
  const metrics = metricsRaw as MetricsSnapshot | undefined;

  const syncTone = useMemo(() => {
    const failed = health?.checks?.failedSyncJobs ?? metrics?.syncQueue?.failed ?? 0;
    const pending = health?.checks?.pendingSyncJobs ?? metrics?.syncQueue?.pending ?? 0;
    if (!health && !metrics) return "unknown" as Tone;
    return toneFromCounts({ failed, pending });
  }, [health, metrics]);

  const outboxTone = useMemo(() => {
    const failed =
      health?.checks?.failedOutboxEvents ?? metrics?.outboxQueue?.failed ?? 0;
    const pending =
      health?.checks?.pendingOutboxEvents ?? metrics?.outboxQueue?.pending ?? 0;
    if (!health && !metrics) return "unknown" as Tone;
    return toneFromCounts({ failed, pending });
  }, [health, metrics]);

  const dbTone: Tone = useMemo(() => {
    if (!health) return "unknown";
    if (health.database !== "доступна") return "bad";
    if (health.status === "degraded") return "warn";
    return "ok";
  }, [health]);

  const webhookTone: Tone = useMemo(() => {
    const latency = metrics?.runtime?.histograms?.webhookLatencyMs;
    if (!latency || latency.samples === 0) return "unknown";
    if (latency.p95 >= 5000) return "bad";
    if (latency.p95 >= 2000) return "warn";
    return "ok";
  }, [metrics]);

  return (
    <div className="flex items-center gap-2">
      <StatusLight
        label="DB"
        tone={dbTone}
        tooltip={
          <>
            <div className="font-medium">Database: {health?.database ?? "—"}</div>
            <div className="text-muted-foreground">
              Latency: {formatMs(health?.checks?.dbLatencyMs ?? NaN)}
            </div>
          </>
        }
      />
      <StatusLight
        label="Sync"
        tone={syncTone}
        tooltip={
          <>
            <div className="font-medium">
              Pending: {health?.checks?.pendingSyncJobs ?? metrics?.syncQueue?.pending ?? 0}
            </div>
            <div className="text-muted-foreground">
              Failed: {health?.checks?.failedSyncJobs ?? metrics?.syncQueue?.failed ?? 0}
            </div>
          </>
        }
      />
      <StatusLight
        label="Outbox"
        tone={outboxTone}
        tooltip={
          <>
            <div className="font-medium">
              Pending:{" "}
              {health?.checks?.pendingOutboxEvents ?? metrics?.outboxQueue?.pending ?? 0}
            </div>
            <div className="text-muted-foreground">
              Failed:{" "}
              {health?.checks?.failedOutboxEvents ?? metrics?.outboxQueue?.failed ?? 0}
            </div>
          </>
        }
      />
      <StatusLight
        label="Webhook"
        tone={webhookTone}
        tooltip={
          <>
            <div className="font-medium">
              Avg:{" "}
              {formatMs(metrics?.runtime?.histograms?.webhookLatencyMs?.avg ?? NaN)}
            </div>
            <div className="text-muted-foreground">
              P95:{" "}
              {formatMs(metrics?.runtime?.histograms?.webhookLatencyMs?.p95 ?? NaN)}
            </div>
            <div className="text-muted-foreground">
              Samples:{" "}
              {metrics?.runtime?.histograms?.webhookLatencyMs?.samples ?? 0}
            </div>
          </>
        }
      />
    </div>
  );
}
