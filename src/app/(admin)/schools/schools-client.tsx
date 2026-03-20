"use client";

import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { SchoolCreateDialog } from "@/components/schools/school-create-dialog";
import type { SchoolListRow } from "@/components/schools/school-admin-types";
import { useSchoolsTableColumns } from "@/components/schools/schools-table-columns";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteSchoolMutation, useSchoolsAdminListQuery, useSchoolsSyncAllMutation } from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import { routes } from "@/lib/routes";

const emptySyncStats = {
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
} as const;

function normalizeSchoolRow(s: SchoolListRow): SchoolListRow {
  return {
    ...s,
    syncStats: s.syncStats ?? { ...emptySyncStats },
    createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date(s.createdAt).toISOString(),
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : new Date(s.updatedAt).toISOString(),
  };
}

export function SchoolsClient({ initialSchools }: { initialSchools: SchoolListRow[] }) {
  const router = useRouter();
  const { data: rawSchools = [] } = useSchoolsAdminListQuery(initialSchools.map(normalizeSchoolRow));
  const schools = useMemo(() => rawSchools.map(normalizeSchoolRow), [rawSchools]);
  const deleteMutation = useDeleteSchoolMutation();
  const syncMutation = useSchoolsSyncAllMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SchoolListRow | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [q, setQ] = useQueryState("sq", parseAsString.withDefault("").withOptions({ shallow: true }));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return schools;
    return schools.filter((s) => {
      return (
        s.name.toLowerCase().includes(needle) ||
        s.telegramChatId.toLowerCase().includes(needle) ||
        (s.googleSheetUrl?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [schools, q]);

  const handleDelete = useCallback((school: SchoolListRow) => setDeleteTarget(school), []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success("Школу видалено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося видалити школу");
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteMutation, deleteTarget]);

  const handleSyncAll = useCallback(
    async (school: SchoolListRow) => {
      setSyncingId(school.id);
      try {
        const payload = await syncMutation.mutateAsync(school.id);
        const enqueued = payload.enqueued ?? 0;
        toast.success(`Поставлено в чергу: ${enqueued} заявок`);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Не вдалося запустити синхронізацію");
      } finally {
        setSyncingId(null);
      }
    },
    [syncMutation],
  );

  const columns = useSchoolsTableColumns({
    onDelete: handleDelete,
    onSyncAll: handleSyncAll,
    syncingId,
  });

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
      columnPinning: { right: ["actions"] },
    },
    getRowId: (row) => row.id,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Школи</h1>
          <p className="text-muted-foreground text-sm">
            Мультишкільна конфігурація: бот, чат, Нова Пошта, Google Sheets, курси та шаблони — у сторінці
            налаштувань школи.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Додати школу
        </Button>
      </div>

      <div className="data-table-container">
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <Input
              placeholder="Пошук за назвою, чатом, посиланням на таблицю…"
              value={q}
              onChange={(e) => void setQ(e.target.value || null)}
              className="h-8 w-56 lg:w-72"
            />
          </DataTableToolbar>
        </DataTable>
      </div>

      <SchoolCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(row) => {
          router.push(routes.admin.schoolDetail(row.id));
        }}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити школу?</AlertDialogTitle>
            <AlertDialogDescription>
              Школа «{deleteTarget?.name}» та всі пов&apos;язані курси, шаблони, заявки та сесії будуть видалені
              без можливості відновлення.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
