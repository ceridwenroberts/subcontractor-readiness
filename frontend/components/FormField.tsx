"use client";

import * as React from "react";

import { Field, describedBy } from "@/components/ui/field";

/** The few things of a TanStack Form field that the screens use. */
export type FieldLike = {
  name: string;
  state: { value: string; meta: { errors: unknown[]; isBlurred: boolean } };
  handleChange: (value: string) => void;
  handleBlur: () => void;
};

const messageOf = (e: unknown) => (typeof e === "string" ? e : ((e as { message?: string } | null)?.message ?? ""));

/**
 * A text-like field. The error shows once the person has left the field or tried to submit,
 * and then updates as they type, so a mistake is caught early without nagging on the first key.
 */
export function TextField({
  field,
  label,
  help,
  submitted,
  children,
  className,
}: {
  field: FieldLike;
  label: React.ReactNode;
  help?: React.ReactNode;
  submitted: boolean;
  className?: string;
  children: (props: {
    id: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    onBlur: () => void;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const id = React.useId();
  const first = field.state.meta.errors.map(messageOf).find(Boolean) ?? null;
  const error = field.state.meta.isBlurred || submitted ? first : null;
  return (
    <Field label={label} htmlFor={id} help={help} error={error} className={className}>
      {children({
        ...describedBy(id, error, help),
        value: field.state.value,
        onChange: (e) => field.handleChange(e.target.value),
        onBlur: field.handleBlur,
      })}
    </Field>
  );
}
