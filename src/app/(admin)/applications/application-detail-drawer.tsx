"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format-datetime";
import { applicationUpdateSchema } from "@/services/validation";
import { useApplicationDetailQuery, usePatchApplicationMutation } from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ApplicationDetail = {
  id: string;
  studentNameUa: string;
  studentNameEn: string;
  deliveryMode: string;
  deliveryCity: string | null;
  deliveryBranch: string | null;
  deliveryAddress: string | null;
  deliveryCountry: string | null;
  deliveryPhone: string | null;
  deliveryEmail: string | null;
  score: number | null;
  feedbackText: string | null;
  status: string;
  managerCheckedAt: Date | null;
  createdAt: Date;
  courses: Array<{
    bprRequired: boolean;
    course: {
      id: string;
      title: string;
      daysToSend: number;
      bprSpecialtyCheckLink: string | null;
      bprTestLink: string | null;
    };
    certificateFormat: string;
  }>;
  screenshots: Array<{ id: string; fileId: string; sortOrder: number }>;
  school: { id: string; name: string; slug: string };
  statusHistory?: Array<{
    fromStatus: string;
    toStatus: string;
    changedAt: Date;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Нова",
  submitted: "На перевірці",
  approved: "Підтверджено",
  rejected: "Відхилено",
};

const DELIVERY_LABELS: Record<string, string> = {
  none: "—",
  ua: "Україна",
  abroad: "За кордон",
};

export function ApplicationDetailDrawer({
  applicationId,
  open,
  onOpenChange,
  onUpdated,
}: {
  applicationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const patchApplication = usePatchApplicationMutation();
  const { data: rawApplication, isFetching: loading } = useApplicationDetailQuery(applicationId, {
    enabled: open && Boolean(applicationId),
  });
  const application = useMemo(
    () => (rawApplication as ApplicationDetail | null | undefined) ?? null,
    [rawApplication],
  );

  async function handleStatusChange(newStatus: string) {
    if (!applicationId) return;
    const parsed = applicationUpdateSchema.safeParse({ status: newStatus });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Невірні дані для оновлення");
      return;
    }
    try {
      await patchApplication.mutateAsync({ applicationId, body: parsed.data });
      onUpdated?.();
      toast.success("Статус оновлено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося оновити статус");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Завантаження…</div>
        ) : application ? (
          <>
            <SheetHeader>
              <SheetTitle>Заявка #{application.id.slice(0, 8)}</SheetTitle>
              <SheetDescription>{application.school.name}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{STATUS_LABELS[application.status] ?? application.status}</Badge>
                <select
                  className="h-7 rounded border border-input bg-transparent px-2 text-sm"
                  value={application.status}
                  onChange={(e) => void handleStatusChange(e.target.value)}
                  disabled={patchApplication.isPending}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div><span className="text-muted-foreground">ПІБ (UA):</span> {application.studentNameUa}</div>
                <div><span className="text-muted-foreground">ПІБ (EN):</span> {application.studentNameEn}</div>
                <div><span className="text-muted-foreground">Доставка:</span> {DELIVERY_LABELS[application.deliveryMode] ?? application.deliveryMode}</div>
                {application.deliveryCity && <div><span className="text-muted-foreground">Місто:</span> {application.deliveryCity}</div>}
                {application.deliveryBranch && <div><span className="text-muted-foreground">Відділення:</span> {application.deliveryBranch}</div>}
                {application.deliveryAddress && <div><span className="text-muted-foreground">Адреса:</span> {application.deliveryAddress}</div>}
                {application.deliveryCountry && <div><span className="text-muted-foreground">Країна:</span> {application.deliveryCountry}</div>}
                {application.deliveryPhone && <div><span className="text-muted-foreground">Телефон:</span> {application.deliveryPhone}</div>}
                {application.deliveryEmail && <div><span className="text-muted-foreground">Email:</span> {application.deliveryEmail}</div>}
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground">Курси</div>
                <ul className="mt-1 space-y-1">
                  {application.courses.map((ac) => (
                    <li key={ac.course.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>
                          {ac.course.title} — {ac.certificateFormat}
                        </span>
                        {(ac.course.bprSpecialtyCheckLink || ac.course.bprTestLink) && (
                          <Badge variant="secondary">БПР</Badge>
                        )}
                      </div>
                      {(ac.course.bprSpecialtyCheckLink || ac.course.bprTestLink) && (
                        <div className="mt-1 flex flex-wrap gap-3 text-sm">
                          <span className="text-muted-foreground">
                            Потрібне: {ac.bprRequired ? "Так" : "Ні"}
                          </span>
                          {ac.course.bprSpecialtyCheckLink && (
                            <a
                              href={ac.course.bprSpecialtyCheckLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              Перевірка спеціальності
                            </a>
                          )}
                          {ac.course.bprTestLink && (
                            <a
                              href={ac.course.bprTestLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              Тест БПР
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {application.score != null && (
                <div><span className="text-muted-foreground">Оцінка:</span> {application.score}/10</div>
              )}
              {application.feedbackText && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Відгук</div>
                  <p className="mt-1 text-sm">{application.feedbackText}</p>
                </div>
              )}

              {application.screenshots.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Скріни</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {application.screenshots
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((s) => (
                        // eslint-disable-next-line @next/next/no-img-element -- Dynamic API proxy, auth required
                        <img
                          key={s.id}
                          src={apiRoutes.applicationScreenshotsImage(application.id, s.id)}
                          alt="Screenshot"
                          className="max-h-48 rounded border object-contain"
                        />
                      ))}
                  </div>
                </div>
              )}

              {application.statusHistory && application.statusHistory.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Історія статусів</div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {application.statusHistory.map((h, i) => (
                      <li key={i}>
                        {STATUS_LABELS[h.fromStatus] ?? h.fromStatus} → {STATUS_LABELS[h.toStatus] ?? h.toStatus} —{" "}
                        {formatDateTime(h.changedAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Створено: {formatDateTime(application.createdAt)}
                {application.managerCheckedAt && (
                  <> · Підтверджено: {formatDateTime(application.managerCheckedAt)}</>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Заявку не знайдено</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
