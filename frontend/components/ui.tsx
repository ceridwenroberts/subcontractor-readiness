import type { ReactNode } from "react";

import { PLACEHOLDER_BANNER, RETENTION_TEXT, STATUS_HELP, STATUS_LABEL, STATUS_STYLE } from "@/lib/labels";
import type { Status } from "@/lib/schemas";

export function StatusBadge({ status, prefix }: { status: Status; prefix?: string }) {
  return (
    <span
      title={STATUS_HELP[status]}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {prefix ? `${prefix}: ` : ""}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PlaceholderBanner() {
  return (
    <div role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {PLACEHOLDER_BANNER}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200";
export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
export const linkClass = "text-slate-900 underline underline-offset-2 hover:text-slate-600";

export function OverdueBanner({ date }: { date: string | null }) {
  return (
    <ErrorBox>
      {RETENTION_TEXT.overdue}
      {date ? ` (Date set: ${date}.)` : ""}
    </ErrorBox>
  );
}
