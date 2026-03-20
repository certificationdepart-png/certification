"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { STATUSES, STATUS_LABELS } from "./application-statuses";

const TABLE_COL_COUNT = 8;

export function ApplicationsTableSkeleton({ rowCount = 8 }: { rowCount?: number }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "Дата",
              "ПІБ (UA)",
              "ПІБ (EN)",
              "Курси",
              "Статус",
              "Доставка",
              "Оцінка",
              "",
            ].map((label) => (
              <TableHead key={label || "actions"}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rowCount }, (_, i) => (
            <TableRow key={i}>
              {Array.from({ length: TABLE_COL_COUNT }, (_, j) => (
                <TableCell key={j}>
                  <Skeleton
                    className={
                      j === 0
                        ? "h-4 w-32"
                        : j === TABLE_COL_COUNT - 1
                          ? "h-8 w-24"
                          : j === 3
                            ? "h-4 w-40 max-w-[12rem]"
                            : "h-4 w-24"
                    }
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ApplicationsKanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUSES.map((status) => (
        <div
          key={status}
          className="flex min-w-52 flex-col rounded-lg border bg-muted/30 p-2"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-7 rounded-full" />
          </div>
          <div className="flex min-h-24 flex-col gap-2">
            <span className="sr-only">{STATUS_LABELS[status]}</span>
            {[0, 1].map((i) => (
              <div key={i} className="rounded border bg-background p-3 shadow-sm">
                <Skeleton className="h-4 w-3/4 max-w-[10rem]" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-20" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
