"use client";

import type { ApplicationStatus } from "@prisma/client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ApplicationsFilters } from "@/components/applications/applications-board/applications-filters";
import {
  ApplicationsKanbanSkeleton,
  ApplicationsTableSkeleton,
} from "@/components/applications/applications-board/applications-board-skeletons";
import { ApplicationsKanbanView } from "@/components/applications/applications-board/applications-kanban-view";
import { ApplicationsTableView } from "@/components/applications/applications-board/applications-table-view";
import { STATUSES } from "@/components/applications/applications-board/application-statuses";
import type { SchoolOption } from "@/components/applications/applications-board/applications-types";
import { applicationsListQuerySchema } from "@/lib/api-validation";
import { routes } from "@/lib/routes";
import { applicationUpdateSchema } from "@/services/validation";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useApplicationsListQuery,
  useDeleteApplicationMutation,
  usePatchApplicationMutation,
  useRejectionReasonsQuery,
  type RejectionReasonRow,
} from "@/hooks/api";
import { ApiError } from "@/lib/api-http";

const PAGE_SIZE = 20;

export function SchoolApplicationsPanel({
  schoolId,
  schoolName,
}: {
  schoolId: string;
  schoolName: string;
}) {
  const router = useRouter();
  const patchApplication = usePatchApplicationMutation();
  const deleteApplication = useDeleteApplicationMutation();
  const [deleteTarget, setDeleteTarget] = useState<string | string[] | null>(null);
  const [pendingRejectionId, setPendingRejectionId] = useState<string | null>(null);
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const { data: reasonsPayload } = useRejectionReasonsQuery(schoolId);
  const rejectionReasons: RejectionReasonRow[] = reasonsPayload?.data ?? [];

  const schoolOption: SchoolOption = useMemo(
    () => ({ id: schoolId, name: schoolName }),
    [schoolId, schoolName],
  );

  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<ApplicationStatus[]>([]);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const visibleStatuses = useMemo(
    () => (selectedStatuses.length ? selectedStatuses : STATUSES),
    [selectedStatuses],
  );

  const listArgs = useMemo(
    () => ({
      schoolId,
      search: search.trim(),
      status: selectedStatuses,
      page,
      pageSize: PAGE_SIZE,
    }),
    [schoolId, search, selectedStatuses, page],
  );

  const listQueryEnabled = useMemo(() => {
    const parsed = applicationsListQuerySchema.safeParse({
      schoolId,
      status: selectedStatuses.length ? selectedStatuses : undefined,
      search: search.trim() ? search.trim() : undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    return parsed.success;
  }, [schoolId, selectedStatuses, search, page]);

  const { data: listPayload, isFetching: loading } = useApplicationsListQuery(listArgs, {
    enabled: listQueryEnabled && schoolId.length > 0,
  });

  const data = listPayload?.data ?? [];
  const total = listPayload?.total ?? 0;

  function applicationDetailUrl(applicationId: string) {
    return routes.admin.applicationDetail(applicationId);
  }

  async function mutateApplication(applicationId: string, payload: unknown) {
    setUpdatingId(applicationId);
    try {
      const parsed = applicationUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Невірні дані для оновлення");
        return;
      }
      await patchApplication.mutateAsync({ applicationId, body: parsed.data });
      toast.success("Оновлено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося оновити заявку");
    } finally {
      setUpdatingId(null);
    }
  }

  const handleOpen = (id: string) => {
    router.push(applicationDetailUrl(id));
  };

  const handleConfirm = (id: string) => void mutateApplication(id, { status: "approved" });

  async function confirmDelete() {
    if (!deleteTarget) return;
    const ids = Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget];
    try {
      await Promise.all(ids.map((id) => deleteApplication.mutateAsync(id)));
      toast.success(ids.length > 1 ? `Видалено ${ids.length} заявок` : "Заявку видалено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося видалити заявку");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleConfirmKanbanRejection() {
    if (!pendingRejectionId || !selectedReasonId) return;
    const applicationId = pendingRejectionId;
    setUpdatingId(applicationId);
    setPendingRejectionId(null);
    try {
      await patchApplication.mutateAsync({
        applicationId,
        body: { status: "rejected", rejectionReasonId: selectedReasonId },
      });
      toast.success("Заявку відхилено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося відхилити заявку");
    } finally {
      setUpdatingId(null);
    }
  }

  const handleDragStatusChange = async (applicationId: string, newStatus: ApplicationStatus) => {
    if (updatingId) return;

    if (newStatus === "rejected" && rejectionReasons.length > 0) {
      setSelectedReasonId(rejectionReasons[0]?.id ?? "");
      setPendingRejectionId(applicationId);
      return;
    }

    setUpdatingId(applicationId);
    try {
      const parsed = applicationUpdateSchema.safeParse({ status: newStatus });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Невірні дані для оновлення");
        return;
      }

      await patchApplication.mutateAsync({ applicationId, body: parsed.data });
      toast.success("Статус оновлено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося оновити статус");
    } finally {
      setUpdatingId(null);
    }
  };

  const pageFrom = (page - 1) * PAGE_SIZE + 1;
  const pageTo = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <ApplicationsFilters
        schools={[schoolOption]}
        selectedSchoolId={schoolId}
        onSchoolChange={() => {}}
        search={search}
        onSearchChange={(next) => {
          setSearch(next);
          setPage(1);
        }}
        selectedStatuses={selectedStatuses}
        onStatusesChange={(next) => {
          setSelectedStatuses(next);
          setPage(1);
        }}
        view={view}
        onViewChange={setView}
        hideSchoolFilter
        lockedSchoolName={schoolName}
      />

      {loading ? (
        view === "table" ? (
          <ApplicationsTableSkeleton />
        ) : (
          <ApplicationsKanbanSkeleton />
        )
      ) : view === "table" ? (
        <ApplicationsTableView
          data={data}
          onOpenApplicationUrl={applicationDetailUrl}
          onOpenApplication={handleOpen}
          onConfirm={handleConfirm}
          onDelete={(id) => setDeleteTarget(id)}
          onBulkDelete={(ids) => setDeleteTarget(ids)}
          updatingId={updatingId}
        />
      ) : (
        <ApplicationsKanbanView
          data={data}
          statuses={visibleStatuses}
          onDragStatusChange={handleDragStatusChange}
          onConfirm={handleConfirm}
          updatingId={updatingId}
        />
      )}

      {data.length === 0 && !loading ? (
        <div className="py-8 text-center text-muted-foreground">Заявок не знайдено</div>
      ) : null}

      {!loading && total > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Показано {Math.max(0, pageFrom)}–{pageTo} з {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Назад
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Далі
            </button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {Array.isArray(deleteTarget) && deleteTarget.length > 1
                ? `Видалити ${deleteTarget.length} заявки?`
                : "Видалити заявку?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Заявки буде видалено з платформи. Рядки в Google Sheets залишаться.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(pendingRejectionId)} onOpenChange={(open) => { if (!open) setPendingRejectionId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Оберіть причину відхилення</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rejectionReasons.map((reason) => (
              <label key={reason.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <input
                  type="radio"
                  name="kanban-panel-rejection-reason"
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
            <Button variant="outline" onClick={() => setPendingRejectionId(null)}>
              Скасувати
            </Button>
            <Button
              variant="destructive"
              disabled={!selectedReasonId || patchApplication.isPending}
              onClick={() => void handleConfirmKanbanRejection()}
            >
              {patchApplication.isPending ? "Відхилення…" : "Підтвердити"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
