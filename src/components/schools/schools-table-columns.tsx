"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format-datetime";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

import type { SchoolListRow, SchoolSyncQueueStats } from "./school-admin-types";

function GoogleSheetsSyncStatus({
  schoolId,
  stats,
}: {
  schoolId: string;
  stats: SchoolSyncQueueStats;
}) {
  const queue = stats.pending + stats.processing;
  const total = stats.pending + stats.processing + stats.completed + stats.failed;

  let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "outline";
  let label = "Немає задач";

  if (stats.failed > 0) {
    badgeVariant = "destructive";
    label = stats.failed === 1 ? "1 помилка" : `${stats.failed} помилок`;
  } else if (queue > 0) {
    badgeVariant = "secondary";
    label = queue === 1 ? "1 в черзі" : `Черга: ${queue}`;
  } else if (total > 0) {
    badgeVariant = "default";
    label = "Актуально";
  }

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-default border-0 bg-transparent p-0 text-left">
        <Badge variant={badgeVariant} className="pointer-events-none text-[10px] font-normal">
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs space-y-2 text-xs">
        <p className="font-medium">Google Sheets — черга</p>
        <ul className="text-muted-foreground space-y-0.5">
          <li>Очікують: {stats.pending}</li>
          <li>Обробка: {stats.processing}</li>
          <li>Успішно: {stats.completed}</li>
          <li>Помилки: {stats.failed}</li>
        </ul>
        <Link
          href={`${routes.admin.sync}?schoolId=${encodeURIComponent(schoolId)}`}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Відкрити чергу
        </Link>
      </TooltipContent>
    </Tooltip>
  );
}

export function useSchoolsTableColumns({
  onDelete,
  onSyncAll,
  syncingId,
}: {
  onDelete: (school: SchoolListRow) => void;
  onSyncAll: (school: SchoolListRow) => void;
  syncingId: string | null;
}): ColumnDef<SchoolListRow>[] {
  const router = useRouter();

  return useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Назва" />,
        cell: ({ row }) => (
          <Link
            href={routes.admin.schoolDetail(row.original.id)}
            className="max-w-[220px] font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "telegramChatId",
        header: "Чат TG",
        cell: ({ row }) => (
          <span className="max-w-[140px] truncate font-mono text-xs" title={row.original.telegramChatId}>
            {row.original.telegramChatId}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: "integrations",
        header: "Інтеграції",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant={row.original.hasTelegramBotToken ? "secondary" : "outline"} className="text-[10px]">
              Бот
            </Badge>
            <Badge variant={row.original.hasNovaPoshtaApiKey ? "secondary" : "outline"} className="text-[10px]">
              НП
            </Badge>
            {row.original.googleSheetUrl ? (
              <Badge variant="secondary" className="text-[10px]">
                Sheet
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Sheet
              </Badge>
            )}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: "sheetsSync",
        header: "Синк Sheets",
        cell: ({ row }) => (
          <GoogleSheetsSyncStatus schoolId={row.original.id} stats={row.original.syncStats} />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Створено" />,
        cell: ({ row }) => formatDateTime(row.original.createdAt),
        enableSorting: true,
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const school = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                aria-label="Дії"
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => router.push(routes.admin.schoolDetail(school.id))}>
                  Налаштування школи
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!school.googleSheetUrl}
                  onClick={() => {
                    if (school.googleSheetUrl) {
                      window.open(school.googleSheetUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  Відкрити Google Sheet
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`${routes.admin.applications}?schoolId=${encodeURIComponent(school.id)}`)
                  }
                >
                  Заявки цієї школи
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={syncingId === school.id}
                  onClick={() => onSyncAll(school)}
                >
                  {syncingId === school.id ? "Синхронізація…" : "Синхронізувати всі заявки"}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(school)}>
                  Видалити школу
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [onDelete, onSyncAll, syncingId, router],
  );
}
