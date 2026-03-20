"use client";

import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type StepperStep = {
  title: string;
  description?: string;
};

function StepCircle({
  done,
  current,
  number,
}: {
  done: boolean;
  current: boolean;
  number: number;
}) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
        done && "border-primary bg-primary text-primary-foreground shadow-sm",
        current && !done && "border-primary bg-background text-primary ring-2 ring-ring/40",
        !done && !current && "border-muted-foreground/25 bg-muted/40 text-muted-foreground",
      )}
      aria-hidden
    >
      {done ? <Check className="size-4" strokeWidth={2.5} /> : number}
    </div>
  );
}

/**
 * Horizontal stepper for multi-step flows (dialogs, wizards).
 */
export function StepperIndicator({
  steps,
  currentIndex,
  className,
}: {
  steps: readonly StepperStep[];
  currentIndex: number;
  className?: string;
}) {
  return (
    <nav aria-label="Кроки" className={cn("w-full", className)}>
      <ol className="flex w-full items-start">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <React.Fragment key={step.title}>
              <li className="flex min-w-0 flex-col items-center gap-2" aria-current={current ? "step" : undefined}>
                <StepCircle done={done} current={current} number={i + 1} />
                <div className="px-1 text-center">
                  <p
                    className={cn(
                      "text-[11px] leading-tight font-semibold sm:text-xs",
                      current ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </p>
                  {step.description ? (
                    <p className="text-muted-foreground mt-0.5 hidden text-[10px] leading-snug sm:block">
                      {step.description}
                    </p>
                  ) : null}
                </div>
              </li>
              {i < steps.length - 1 ? (
                <li
                  className="mx-1 mt-[18px] flex min-h-px min-w-[6px] flex-1 list-none"
                  aria-hidden
                >
                  <div
                    className={cn(
                      "h-0.5 w-full rounded-full transition-colors",
                      i < currentIndex ? "bg-primary" : "bg-border",
                    )}
                  />
                </li>
              ) : null}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
