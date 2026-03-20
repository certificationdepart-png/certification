"use client";

import type { ApplicationStatus } from "@prisma/client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-datetime";
import { routes } from "@/lib/routes";

import type { ApplicationListItem } from "./applications-types";
import { DELIVERY_MODE_LABELS, STATUS_LABELS } from "./application-statuses";
import { StatusDescriptionInfo } from "./status-description-tooltip";

export function ApplicationsKanbanView({
  data,
  statuses,
  onDragStatusChange,
  onConfirm,
  updatingId,
}: {
  data: ApplicationListItem[];
  statuses: ApplicationStatus[];
  onDragStatusChange: (applicationId: string, newStatus: ApplicationStatus) => void;
  onConfirm: (applicationId: string) => void;
  updatingId: string | null;
}) {
  const router = useRouter();

  const groupedByStatus = useMemo(() => {
    const map = new Map<ApplicationStatus, ApplicationListItem[]>();
    for (const s of statuses) map.set(s, []);
    for (const app of data) {
      if (!map.has(app.status)) continue;
      map.get(app.status)?.push(app);
    }
    return map;
  }, [data, statuses]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statuses.map((status) => (
        <div
          key={status}
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={(ev) => {
            ev.preventDefault();
            if (updatingId) return;
            const appId = ev.dataTransfer.getData("applicationId");
            if (appId) onDragStatusChange(appId, status);
          }}
          className="flex min-w-52 flex-col rounded-lg border bg-muted/30 p-2"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-sm font-medium">{STATUS_LABELS[status]}</span>
              <StatusDescriptionInfo status={status} />
            </div>
            <Badge variant="outline">{groupedByStatus.get(status)?.length ?? 0}</Badge>
          </div>

          <div className="flex min-h-24 flex-col gap-2">
            {(groupedByStatus.get(status) ?? []).map((app) => {
              const isMutating = updatingId === app.id;
              const courses = app.courses.map((ac) => ac.course.title).join(", ") || "—";
              const canConfirm = app.status !== "approved";

              return (
                <div
                  key={app.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(routes.admin.applicationDetail(app.id))}
                  onKeyDown={(e) => e.key === "Enter" && router.push(routes.admin.applicationDetail(app.id))}
                  className="cursor-pointer rounded border bg-background p-3 text-sm shadow-sm transition hover:bg-muted/50"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("applicationId", app.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{app.studentNameUa}</div>
                      <div className="truncate text-xs text-muted-foreground">{courses}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDate(app.createdAt)}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {DELIVERY_MODE_LABELS[app.deliveryMode] ?? app.deliveryMode}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 items-end">
                      {canConfirm && (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={isMutating}
                          onClick={(e) => {
                            e.stopPropagation();
                            onConfirm(app.id);
                          }}
                        >
                          Підтвердити
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

