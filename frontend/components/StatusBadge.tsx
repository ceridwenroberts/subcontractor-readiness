import { HelpCircle, Timer } from "lucide-react";
import * as React from "react";

import { cn } from "@/components/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_HELP, STATUS_LABEL, STATUS_SHORT } from "@/lib/labels";
import type { Status } from "@/lib/schemas";

/**
 * Colours only, and in black and white: the five statuses differ by icon, fill and border,
 * never by a good or bad hue. The text label always stays. Wording lives in lib/labels.ts.
 */
export const STATUS_STYLE: Record<Status, string> = {
  found: "border-foreground bg-foreground text-background",
  partial: "border-foreground bg-background text-foreground",
  missing: "border-dashed border-muted-foreground bg-transparent text-muted-foreground",
  unclear: "border-border bg-muted text-foreground",
  expired: "border-foreground bg-muted text-foreground",
};

const svg = { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": true, className: "shrink-0" } as const;

const ICON: Record<Status, React.ReactNode> = {
  // solid circle
  found: (
    <svg {...svg}>
      <circle cx="7" cy="7" r="5.5" fill="currentColor" />
    </svg>
  ),
  // half circle
  partial: (
    <svg {...svg}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 1.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
    </svg>
  ),
  // dashed circle
  missing: (
    <svg {...svg}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2.2" />
    </svg>
  ),
  unclear: <HelpCircle className="size-3.5 shrink-0" aria-hidden />,
  expired: <Timer className="size-3.5 shrink-0" aria-hidden />,
};

export function StatusIcon({ status }: { status: Status }) {
  return <>{ICON[status]}</>;
}

export function StatusBadge({
  status,
  prefix,
  short,
  className,
}: {
  status: Status;
  prefix?: string;
  /** The short label, for tight places such as table cells. The tooltip keeps the full help. */
  short?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-px text-xs font-medium",
            STATUS_STYLE[status],
            className,
          )}
        >
          {ICON[status]}
          {prefix ? `${prefix}: ` : ""}
          {short ? STATUS_SHORT[status] : STATUS_LABEL[status]}
        </span>
      </TooltipTrigger>
      <TooltipContent>{STATUS_HELP[status]}</TooltipContent>
    </Tooltip>
  );
}
