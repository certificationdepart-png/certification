"use client";

import type { ApplicationStatus } from "@prisma/client";
import type { ColumnDef } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatDateTime } from "@/lib/format-datetime";

import type { ApplicationListItem } from "./applications-types";
import { DELIVERY_MODE_LABELS, STATUS_LABELS } from "./application-statuses";
import { StatusDescriptionInfo } from "./status-description-tooltip";

export function ApplicationsTableView({
  data,
  onOpenApplicationUrl,
  onOpenApplication,
  onConfirm,
  updatingId,
}: {
  data: ApplicationListItem[];
  onOpenApplicationUrl: (applicationId: string) => string;
  onOpenApplication: (applicationId: string) => void;
  onConfirm: (applicationId: string) => void;
  updatingId: string | null;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const tableColumns: ColumnDef<ApplicationListItem>[] = [
    {
      accessorKey: "createdAt",
      header: "Дата",
      cell: ({ getValue }) => formatDateTime(getValue() as string),
    },
    { accessorKey: "studentNameUa", header: "ПІБ (UA)" },
    { accessorKey: "studentNameEn", header: "ПІБ (EN)" },
    {
      id: "courses",
      header: "Курси",
      cell: ({ row }) => row.original.courses.map((ac) => ac.course.title).join(", ") || "—",
    },
    {
      accessorKey: "status",
      header: "Статус",
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
      header: "Доставка",
      cell: ({ getValue }) => {
        const mode = (getValue() as keyof typeof DELIVERY_MODE_LABELS) ?? "none";
        return DELIVERY_MODE_LABELS[mode] ?? String(getValue());
      },
    },
    {
      accessorKey: "score",
      header: "Оцінка",
      cell: ({ getValue }) => (getValue() != null ? String(getValue()) : "—"),
    },
  ];

  const table = useReactTable({
    data,
    columns: [
      ...tableColumns,
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
            </div>
          );
        },
      },
    ],
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onOpenApplication(row.original.id)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

