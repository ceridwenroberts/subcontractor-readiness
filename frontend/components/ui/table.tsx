import * as React from "react";

import { cn } from "@/components/cn";

/** Scrolls sideways inside its own box on narrow screens. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("border-b border-border text-xs text-muted-foreground", className)} {...props} />;
}
export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}
export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("align-top", className)} {...props} />;
}
export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("px-3 py-1.5 font-medium", className)} {...props} />;
}
export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-3 py-2", className)} {...props} />;
}
