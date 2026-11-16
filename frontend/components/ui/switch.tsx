"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/components/cn";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border border-input bg-muted p-0.5 transition-colors hover:border-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3 rounded-full bg-foreground transition-transform data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-primary-foreground" />
    </SwitchPrimitive.Root>
  );
}
