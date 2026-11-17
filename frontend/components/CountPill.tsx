import type { LucideIcon } from "lucide-react";

import { cn } from "@/components/cn";

/** A neutral pill for a count. Filled when there is something to look at, quiet when there is not. */
export function CountPill({
  count,
  one,
  many,
  none,
  icon: Icon,
}: {
  count: number;
  one: string;
  many: string;
  none: string;
  icon?: LucideIcon;
}) {
  const active = count > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-xs font-medium",
        active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground",
      )}
    >
      {Icon && active && <Icon className="size-3" aria-hidden />}
      {active ? `${count} ${count === 1 ? one : many}` : none}
    </span>
  );
}
