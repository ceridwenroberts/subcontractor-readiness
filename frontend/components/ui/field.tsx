import { AlertCircle } from "lucide-react";
import * as React from "react";

import { cn } from "@/components/cn";

/** A labelled form field with help text and an error line wired to the control for screen readers. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  help?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="flex items-start gap-1 text-xs text-foreground">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : help ? (
        <p id={`${htmlFor}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for a control inside <Field>. */
export function describedBy(id: string, error?: string | null, help?: React.ReactNode) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : help ? `${id}-help` : undefined,
  } as const;
}
