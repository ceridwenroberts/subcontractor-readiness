"use client";

import { useId } from "react";

export type PickerRequirement = { code: string; title: string };

/**
 * Which requirements a document is for. Nothing ticked means "not sure": the document is read for
 * every requirement. Ticking several is how one PDF covers several requirements.
 */
export function RequirementPicker({
  requirements,
  value,
  onChange,
  disabled,
}: {
  requirements: PickerRequirement[];
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const summary =
    value.length === 0
      ? "Not sure, check all requirements"
      : value.length <= 2
        ? value.join(", ")
        : `${value.length} requirements`;
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none rounded-md border border-input px-2 py-1 hover:bg-muted">
        <span className="text-muted-foreground">Used for: </span>
        {summary}
      </summary>
      <fieldset disabled={disabled} className="mt-1 space-y-1 rounded-md border border-border bg-background p-2">
        <legend className="sr-only">Requirements this document is for</legend>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs underline underline-offset-2 hover:text-muted-foreground"
        >
          Not sure, check all requirements
        </button>
        {requirements.map((r) => (
          <label key={r.code} htmlFor={`${id}-${r.code}`} className="flex cursor-pointer items-start gap-2 py-0.5">
            <input
              id={`${id}-${r.code}`}
              type="checkbox"
              className="mt-0.5"
              checked={value.includes(r.code)}
              onChange={() => toggle(r.code)}
            />
            <span>
              <span className="font-mono text-muted-foreground">{r.code}</span> {r.title}
            </span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}
