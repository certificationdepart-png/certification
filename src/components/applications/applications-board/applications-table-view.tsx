"use client";

import type { ApplicationStatus } from "@prisma/client";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { formatDateTime } from "@/lib/format-datetime";

import type { ApplicationListItem } from "./applications-types";
import { DELIVERY_MODE_LABELS, STATUS_LABELS } from "./application-statuses";
import { StatusDescriptionInfo } from "./status-description-tooltip";
import { TrashIcon } from "lucide-react";

const PAGE_SIZE_DEFAULT = 20;

export function ApplicationsTableView({
  data,
  total,
  page,
  pageSize = PAGE_SIZE_DEFAULT,
  onPageChange,
  onOpenApplicationUrl,
  onOpenApplication,
  onConfirm,
  onDelete,
  onBulkDelete,
  updatingId,
}: {
  data: ApplicationListItem[];
  total: number;
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onOpenApplicationUrl: (applicationId: string) => string;
  onOpenApplication: (applicationId: string) => void;
  onConfirm: (applicationId: string) => void;
  onDelete: (applicationId: string) => void;
  onBulkDelete: (applicationIds: string[]) => void;
  updatingId: string | null;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const pagination: PaginationState = useMemo(
    () => ({ pageIndex: page - 1, pageSize }),
    [page, pageSize],
  );

  const pageCount = Math.ceil(total / pageSize);

  const columns: ColumnDef<ApplicationListItem>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Вибрати всі"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Вибрати"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 32,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Дата" />,
        cell: ({ getValue }) => formatDateTime(getValue() as string),
      },
      {
        accessorKey: "studentNameUa",
        header: ({ column }) => <DataTableColumnHeader column={column} label="ПІБ (UA)" />,
      },
      {
        accessorKey: "studentNameEn",
        header: ({ column }) => <DataTableColumnHeader column={column} label="ПІБ (EN)" />,
      },
      {
        id: "courses",
        header: "Курси",
        cell: ({ row }) => {
          const courses = row.original.courses.map((ac) => ac.course.title).join(", ") || "—";
          return <div className="max-w-[22rem] whitespace-normal break-words">{courses}</div>;
        },
        enableSorting: false,
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Статус" />,
        cell: ({ getValue }) => {
          const status = (getValue() as ApplicationStatus) ?? "new";
          return (
            <div className="flex items-center gap-1">
              <Badge variant="outline">{STATUS_LABELS[status] ?? status}</Badge>
              <StatusDescriptionInfo status={status} />
            </div>
          );
        },
      },
      {
        accessorKey: "deliveryMode",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Доставка" />,
        cell: ({ getValue }) => {
          const mode = (getValue() as keyof typeof DELIVERY_MODE_LABELS) ?? "none";
          return DELIVERY_MODE_LABELS[mode] ?? String(getValue());
        },
      },
      {
        accessorKey: "score",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Оцінка" />,
        cell: ({ getValue }) => (getValue() != null ? String(getValue()) : "—"),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const application = row.original;
          const isMutating = updatingId === application.id;
          const canConfirm = application.status !== "approved";
          return (
            <div className="flex items-center gap-2">
              <Link href={onOpenApplicationUrl(application.id)} onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm">
                  Деталі
                </Button>
              </Link>
              {canConfirm && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirm(application.id);
                  }}
                  disabled={isMutating}
                >
                  Підтвердити
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(application.id);
                }}
                disabled={isMutating}
              >
                <TrashIcon className="size-4" />
              </Button>
            </div>
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [updatingId, onOpenApplicationUrl, onConfirm, onDelete],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, pagination },
    pageCount,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      onPageChange(next.pageIndex + 1);
    },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const actionBar = selectedIds.length > 0 ? (
    <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2 text-sm">
      <span>Вибрано: {selectedIds.length}</span>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          onBulkDelete(selectedIds);
          setRowSelection({});
        }}
      >
        Видалити вибрані ({selectedIds.length})
      </Button>
    </div>
  ) : null;

  return (
    <DataTable
      table={table}
      actionBar={actionBar}
      onRowClick={(row) => onOpenApplication(row.original.id)}
    >
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
