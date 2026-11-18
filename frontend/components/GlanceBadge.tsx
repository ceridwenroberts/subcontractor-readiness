import { AlertCircle, CheckCircle2, CircleDashed, FilePlus2, Hourglass, type LucideIcon, Upload } from "lucide-react";

import { cn } from "@/components/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLANCE_HELP, GLANCE_LABEL } from "@/lib/labels";
import type { Glance } from "@/lib/schemas";

// Black and white: the states differ by icon and fill, never by a good or bad colour.
const STYLE: Record<Glance, { icon: LucideIcon; className: string }> = {
  documentation_complete: { icon: CheckCircle2, className: "border-foreground bg-foreground text-background" },
  awaiting_decision: { icon: Hourglass, className: "border-foreground bg-background text-foreground" },
  new_upload_requested: { icon: Upload, className: "border-foreground bg-muted text-foreground" },
  documents_missing: { icon: FilePlus2, className: "border-dashed border-foreground bg-muted text-foreground" },
  gaps_recorded: { icon: AlertCircle, className: "border-dashed border-foreground bg-background text-foreground" },
  not_assessed: { icon: CircleDashed, className: "border-dashed border-muted-foreground bg-transparent text-muted-foreground" },
};

/** Where one subcontractor's review stands, at a glance. */
export function GlanceBadge({ glance, className }: { glance: Glance; className?: string }) {
  const { icon: Icon, className: style } = STYLE[glance];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-xs font-medium",
            style,
            className,
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {GLANCE_LABEL[glance]}
        </span>
      </TooltipTrigger>
      <TooltipContent>{GLANCE_HELP[glance]}</TooltipContent>
    </Tooltip>
  );
}
