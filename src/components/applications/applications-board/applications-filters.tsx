"use client";

import { GraduationCapIcon } from "@phosphor-icons/react/dist/csr/GraduationCap";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneRight";
import { SealCheckIcon } from "@phosphor-icons/react/dist/csr/SealCheck";
import { XCircleIcon } from "@phosphor-icons/react/dist/csr/XCircle";
import type { ApplicationStatus } from "@prisma/client";
import type { SchoolOption } from "./applications-types";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { STATUSES, STATUS_LABELS } from "./application-statuses";
import {
  AllStatusesFilterInfo,
  StatusDescriptionInfo,
} from "./status-description-tooltip";

function StatusFilterIcon({ status, className }: { status: ApplicationStatus; className?: string }) {
  const IconComp =
    status === "new"
      ? ClockIcon
      : status === "submitted"
        ? PaperPlaneRightIcon
        : status === "approved"
          ? SealCheckIcon
          : XCircleIcon;

  return <IconComp className={className} size={16} weight="regular" />;
}

export function ApplicationsFilters({
  schools,
  selectedSchoolId,
  onSchoolChange,
  search,
  onSearchChange,
  selectedStatuses,
  onStatusesChange,
  view,
  onViewChange,
  hideSchoolFilter,
  lockedSchoolName,
}: {
  schools: SchoolOption[];
  selectedSchoolId: string;
  onSchoolChange: (schoolId: string) => void;
  search: string;
  onSearchChange: (next: string) => void;
  selectedStatuses: ApplicationStatus[];
  onStatusesChange: (next: ApplicationStatus[]) => void;
  view: "table" | "kanban";
  onViewChange: (view: "table" | "kanban") => void;
  /** When set, school dropdown is hidden (e.g. school detail page). */
  hideSchoolFilter?: boolean;
  lockedSchoolName?: string;
}) {
  const isAllStatuses = selectedStatuses.length === 0;
  const selectedSchoolName = schools.find((s) => s.id === selectedSchoolId)?.name ?? "Усі школи";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {hideSchoolFilter ? (
        <div
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "pointer-events-none inline-flex items-center gap-2 px-3 text-muted-foreground",
          )}
        >
          <GraduationCapIcon className="shrink-0" size={16} />
          <span>Школа: {lockedSchoolName ?? selectedSchoolName}</span>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex items-center gap-2 px-3")}
          >
            <GraduationCapIcon className="shrink-0 text-muted-foreground" size={16} />
            <span>Школа: {selectedSchoolName}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72">
            <DropdownMenuRadioGroup
              value={selectedSchoolId || "all"}
              onValueChange={(value) => onSchoolChange(value === "all" ? "" : String(value))}
            >
              <DropdownMenuRadioItem value="all">
                <span className="flex items-center gap-2">
                  <GraduationCapIcon className="text-muted-foreground" size={16} />
                  Усі школи
                </span>
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              {schools.map((s) => (
                <DropdownMenuRadioItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <GraduationCapIcon className="text-muted-foreground" size={16} />
                    {s.name}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {selectedSchoolId ? (
              <>
                <DropdownMenuSeparator className="my-2" />
                <div className="px-2 pb-1 pt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onSchoolChange("")}
                  >
                    Очистити школу
                  </Button>
                </div>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex items-center gap-2 px-3")}
        >
          <ClockIcon className="shrink-0 text-muted-foreground" size={16} />
          <span>Статус: {isAllStatuses ? "Усі" : `${selectedStatuses.length} обрано`}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuCheckboxItem
            checked={isAllStatuses}
            closeOnClick={false}
            onCheckedChange={(checked) => {
              if (checked) onStatusesChange([]);
            }}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <ClockIcon className="shrink-0 text-muted-foreground" size={16} />
              <span className="min-w-0 flex-1">Усі статуси</span>
              <AllStatusesFilterInfo />
            </span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {STATUSES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={selectedStatuses.includes(s)}
              closeOnClick={false}
              onCheckedChange={(checked) => {
                if (checked) {
                  onStatusesChange([...selectedStatuses, s]);
                  return;
                }
                onStatusesChange(selectedStatuses.filter((x) => x !== s));
              }}
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                <StatusFilterIcon status={s} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">{STATUS_LABELS[s]}</span>
                <StatusDescriptionInfo status={s} />
              </span>
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 pb-1 pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => onStatusesChange([])}
            >
              Скинути статуси
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Input
        placeholder="Пошук (ПІБ, відгук…)"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />

      <div className="flex gap-1 ml-auto">
        <Button
          type="button"
          variant={view === "table" ? "default" : "outline"}
          size="sm"
          onClick={() => onViewChange("table")}
        >
          Таблиця
        </Button>
        <Button
          type="button"
          variant={view === "kanban" ? "default" : "outline"}
          size="sm"
          onClick={() => onViewChange("kanban")}
        >
          Kanban
        </Button>
      </div>
    </div>
  );
}

