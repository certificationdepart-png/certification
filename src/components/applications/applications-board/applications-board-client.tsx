"use client";

import type { ApplicationStatus } from "@prisma/client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";

import { applicationsListQuerySchema } from "@/lib/api-validation";
import { routes } from "@/lib/routes";

import { applicationUpdateSchema } from "@/services/validation";

import {
  useApplicationsListQuery,
  useDeleteApplicationMutation,
  usePatchApplicationMutation,
  useRejectionReasonsQuery,
  type RejectionReasonRow,
} from "@/hooks/api";
import { ApiError } from "@/lib/api-http";

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
import { ApplicationsFilters } from "./applications-filters";
import type { SchoolOption } from "./applications-types";
import { STATUSES } from "./application-statuses";
import {
  ApplicationsKanbanSkeleton,
  ApplicationsTableSkeleton,
} from "./applications-board-skeletons";
import { ApplicationsKanbanView } from "./applications-kanban-view";
import { ApplicationsTableView } from "./applications-table-view";

const PAGE_SIZE = 20;
const VALID_STATUS_SET = new Set(STATUSES);

export function ApplicationsBoardClient({ schools }: { schools: SchoolOption[] }) {
  const router = useRouter();
  const patchApplication = usePatchApplicationMutation();
  const deleteApplication = useDeleteApplicationMutation();
  const [deleteTarget, setDeleteTarget] = useState<string | string[] | null>(null);
  const [pendingRejectionId, setPendingRejectionId] = useState<string | null>(null);
  const [selectedReasonId, setSelectedReasonId] = useState("");

  const [schoolId, setSchoolId] = useQueryState(
    "schoolId",
    parseAsString.withDefault(""),
  );
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault(""),
  );
  const [status, setStatus] = useQueryState(
    "status",
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [view, setView] = useState<"table" | "kanban">("table");

  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const selectedSchoolId = schoolId;
  const { data: reasonsPayload } = useRejectionReasonsQuery(selectedSchoolId, {
    enabled: Boolean(selectedSchoolId),
  });
  const rejectionReasons: RejectionReasonRow[] = reasonsPayload?.data ?? [];

  const selectedStatuses = useMemo(
    () =>
      status.filter(
        (s): s is ApplicationStatus => VALID_STATUS_SET.has(s as ApplicationStatus),
      ),
    [status],
  );
  const visibleStatuses = useMemo(
    () => (selectedStatuses.length ? selectedStatuses : STATUSES),
    [selectedStatuses],
  );

  const listArgs = useMemo(
    () => ({
      schoolId: selectedSchoolId,
      search: search.trim(),
      status: selectedStatuses,
      page,
      pageSize: PAGE_SIZE,
    }),
    [selectedSchoolId, search, selectedStatuses, page],
  );

  const listQueryEnabled = useMemo(() => {
    const parsed = applicationsListQuerySchema.safeParse({
      schoolId: selectedSchoolId ? selectedSchoolId : undefined,
      status: selectedStatuses.length ? selectedStatuses : undefined,
      search: search.trim() ? search.trim() : undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    return parsed.success;
  }, [selectedSchoolId, selectedStatuses, search, page]);

  const { data: listPayload, isFetching: loading } = useApplicationsListQuery(listArgs, {
    enabled: listQueryEnabled,
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

  const handleOpen = (id: string) => {
    router.push(applicationDetailUrl(id));
  };

  const handleConfirm = (id: string) => void mutateApplication(id, { status: "approved" });

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

  return (
    <div className="space-y-4">
      <ApplicationsFilters
        schools={schools}
        selectedSchoolId={selectedSchoolId}
        onSchoolChange={(next) => {
          setSchoolId(next);
          setPage(1);
        }}
        search={search}
        onSearchChange={(next) => {
          setSearch(next);
          setPage(1);
        }}
        selectedStatuses={selectedStatuses}
        onStatusesChange={(next) => {
          setStatus(next);
          setPage(1);
        }}
        view={view}
        onViewChange={setView}
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
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
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
                  name="kanban-rejection-reason"
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
