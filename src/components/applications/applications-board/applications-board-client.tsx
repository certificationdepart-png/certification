"use client";

import type { ApplicationStatus } from "@prisma/client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";

import { applicationsListQuerySchema } from "@/lib/api-validation";
import { routes } from "@/lib/routes";

import { applicationUpdateSchema } from "@/services/validation";

import { useApplicationsListQuery, usePatchApplicationMutation } from "@/hooks/api";
import { ApiError } from "@/lib/api-http";

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

  const handleOpen = (id: string) => {
    router.push(applicationDetailUrl(id));
  };

  const handleConfirm = (id: string) => void mutateApplication(id, { status: "approved" });

  const handleDragStatusChange = async (applicationId: string, newStatus: ApplicationStatus) => {
    if (updatingId) return;

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
          onOpenApplicationUrl={applicationDetailUrl}
          onOpenApplication={handleOpen}
          onConfirm={handleConfirm}
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

      {!loading && total > 0 && (
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
      )}
    </div>
  );
}
