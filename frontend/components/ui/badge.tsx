import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/components/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-px text-xs font-medium", {
  variants: {
    variant: {
      default: "border-foreground bg-foreground text-background",
      outline: "border-border bg-background text-foreground",
      muted: "border-transparent bg-muted text-muted-foreground",
      dashed: "border-dashed border-muted-foreground bg-transparent text-muted-foreground",
      model: "dev-surface",
    },
  },
  defaultVariants: { variant: "outline" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
