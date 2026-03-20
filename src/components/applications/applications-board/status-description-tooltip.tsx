"use client";

import type { SyntheticEvent } from "react";
import type { ApplicationStatus } from "@prisma/client";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  STATUS_DESCRIPTIONS_UK,
  STATUS_FILTER_ALL_TOOLTIP_UK,
} from "./application-statuses";

function stopMenuBubble(e: SyntheticEvent) {
  e.stopPropagation();
}

type Props = {
  description: string;
  className?: string;
  /** Доступна назва для скрінрідерів */
  ariaLabel?: string;
};

/**
 * Компактна іконка «інфо» з tooltip — не реагує на клік по рядку меню (stopPropagation).
 */
export function StatusHelpIcon({ description, className, ariaLabel }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )}
        aria-label={ariaLabel ?? "Пояснення"}
        onPointerDown={stopMenuBubble}
        onClick={stopMenuBubble}
      >
        <InfoIcon size={14} weight="regular" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-xs text-left">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

export function StatusDescriptionInfo({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <StatusHelpIcon
      description={STATUS_DESCRIPTIONS_UK[status]}
      ariaLabel={`Що означає статус: ${status}`}
      className={className}
    />
  );
}

export function AllStatusesFilterInfo({ className }: { className?: string }) {
  return (
    <StatusHelpIcon
      description={STATUS_FILTER_ALL_TOOLTIP_UK}
      ariaLabel="Що означає фільтр усіх статусів"
      className={className}
    />
  );
}
