import { Info, TriangleAlert, type LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/components/cn";

/**
 * A neutral notice with an icon. No colour carries the meaning: "note" is for information,
 * "alert" is for something that needs attention (read out at once by screen readers).
 */
export function Alert({
  tone = "note",
  icon,
  title,
  className,
  children,
}: {
  tone?: "note" | "alert";
  icon?: LucideIcon;
  title?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const Icon = icon ?? (tone === "alert" ? TriangleAlert : Info);
  return (
    <div
      role={tone === "alert" ? "alert" : "note"}
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-sm",
        tone === "alert" ? "border-foreground bg-muted" : "border-border bg-subtle",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "text-muted-foreground")}>{children}</div>}
      </div>
    </div>
  );
}
