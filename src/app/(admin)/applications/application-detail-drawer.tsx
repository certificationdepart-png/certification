"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/lib/format-datetime";
import { applicationUpdateSchema } from "@/services/validation";
import {
  useApplicationDetailQuery,
  useDeleteApplicationMutation,
  usePatchApplicationMutation,
  useRejectionReasonsQuery,
  type RejectionReasonRow,
} from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  recipientName: string | null;
  recipientPhone: string | null;
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
  const deleteApplication = useDeleteApplicationMutation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const { data: rawApplication, isFetching: loading } = useApplicationDetailQuery(applicationId, {
    enabled: open && Boolean(applicationId),
  });
  const application = useMemo(
    () => (rawApplication as ApplicationDetail | null | undefined) ?? null,
    [rawApplication],
  );
  const schoolId = application?.school.id ?? "";
  const { data: reasonsPayload } = useRejectionReasonsQuery(schoolId, {
    enabled: Boolean(schoolId),
  });
  const rejectionReasons: RejectionReasonRow[] = reasonsPayload?.data ?? [];

  async function handleDelete() {
    if (!applicationId) return;
    try {
      await deleteApplication.mutateAsync(applicationId);
      onOpenChange(false);
      onUpdated?.();
      toast.success("Заявку видалено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося видалити заявку");
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!applicationId) return;

    if (newStatus === "rejected" && rejectionReasons.length > 0) {
      setSelectedReasonId(rejectionReasons[0]?.id ?? "");
      setShowRejectionModal(true);
      return;
    }

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

  async function handleConfirmRejection() {
    if (!applicationId || !selectedReasonId) return;
    try {
      await patchApplication.mutateAsync({
        applicationId,
        body: { status: "rejected", rejectionReasonId: selectedReasonId },
      });
      setShowRejectionModal(false);
      onUpdated?.();
      toast.success("Заявку відхилено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося відхилити заявку");
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

              <div className="space-y-1.5 text-sm">
                <div><span className="text-muted-foreground">ПІБ (UA):</span> {application.studentNameUa}</div>
                <div><span className="text-muted-foreground">ПІБ (EN):</span> {application.studentNameEn}</div>
                <div><span className="text-muted-foreground">Доставка:</span> {DELIVERY_LABELS[application.deliveryMode] ?? application.deliveryMode}</div>

                {application.deliveryMode === "ua" && (
                  <>
                    {application.recipientName && <div><span className="text-muted-foreground">Отримувач НП:</span> {application.recipientName}</div>}
                    {application.recipientPhone && <div><span className="text-muted-foreground">Тел. отримувача:</span> {application.recipientPhone}</div>}
                    {application.deliveryCity && <div><span className="text-muted-foreground">Місто:</span> {application.deliveryCity}</div>}
                    {application.deliveryBranch && <div><span className="text-muted-foreground">Відділення:</span> {application.deliveryBranch}</div>}
                  </>
                )}

                {application.deliveryMode === "abroad" && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 mt-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Міжнародна доставка</p>
                    {application.deliveryCountry && <div><span className="text-muted-foreground">Країна:</span> {application.deliveryCountry}</div>}
                    {application.deliveryAddress && <div><span className="text-muted-foreground">Адреса:</span> {application.deliveryAddress}</div>}
                    {application.deliveryPhone && <div><span className="text-muted-foreground">Телефон:</span> {application.deliveryPhone}</div>}
                    {application.deliveryEmail && <div className="break-words"><span className="text-muted-foreground">Email:</span> {application.deliveryEmail}</div>}
                  </div>
                )}
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

              <div className="border-t pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleteApplication.isPending}
                >
                  Видалити заявку
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Заявку не знайдено</div>
        )}
      </SheetContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити заявку?</AlertDialogTitle>
            <AlertDialogDescription>
              Заявку буде видалено з платформи. Рядки в Google Sheets залишаться.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showRejectionModal} onOpenChange={setShowRejectionModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Оберіть причину відхилення</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rejectionReasons.map((reason) => (
              <label key={reason.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <input
                  type="radio"
                  name="rejection-reason"
                  value={reason.id}
                  checked={selectedReasonId === reason.id}
                  onChange={() => setSelectedReasonId(reason.id)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{reason.label}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs line-clamp-2">{reason.messageText}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowRejectionModal(false)}>
              Скасувати
            </Button>
            <Button
              variant="destructive"
              disabled={!selectedReasonId || patchApplication.isPending}
              onClick={() => void handleConfirmRejection()}
            >
              {patchApplication.isPending ? "Відхилення…" : "Підтвердити"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
