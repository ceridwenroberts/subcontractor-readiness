import type { Status } from "./schemas";

/**
 * Wording for each status. Product rule: report what the documents show, never a verdict.
 * No "approved", "compliant", "qualified", "pass", "fail", and no scores.
 */
export const STATUS_LABEL: Record<Status, string> = {
  found: "Documents show evidence",
  partial: "Documents show part of it",
  missing: "Evidence not found",
  unclear: "Needs human review",
  expired: "Documents show an expired date",
};

export const STATUS_HELP: Record<Status, string> = {
  found: "A quote on the cited page supports this requirement.",
  partial: "A quote supports part of the requirement.",
  missing: "No evidence was found in the uploaded documents. Scans are not read yet.",
  unclear: "The evidence could not be confirmed. A person should read the documents.",
  expired: "A verified quote shows a date that has passed.",
};

export const STATUS_STYLE: Record<Status, string> = {
  found: "bg-emerald-100 text-emerald-900 border-emerald-300",
  partial: "bg-amber-100 text-amber-900 border-amber-300",
  missing: "bg-slate-100 text-slate-800 border-slate-300",
  unclear: "bg-violet-100 text-violet-900 border-violet-300",
  expired: "bg-rose-100 text-rose-900 border-rose-300",
};

export const STATUSES = Object.keys(STATUS_LABEL) as Status[];

export const PLACEHOLDER_BANNER =
  "Placeholder requirements, not reviewed by a domain expert.";
export const SIMULATED_NOTE =
  "Simulated: answers come from a fixed script, not from a real model.";
export const DISCLAIMER =
  "This tool describes what the uploaded documents show. It is not an approval. A person must review and decide.";

/** Words the UI must never use (CLAUDE.md). Tested against every string above. */
export const BANNED_WORDS = ["approved", "compliant", "qualified", "pass", "fail", "score"];
