import * as React from "react";

import { cn } from "@/components/cn";

const field =
  "w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-foreground aria-invalid:border-foreground aria-invalid:ring-1 aria-invalid:ring-foreground";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(field, "h-8", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-16 py-1.5", className)} {...props} />;
}
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(field, "h-8 pr-6", className)} {...props} />;
}
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium", className)} {...props} />;
}
