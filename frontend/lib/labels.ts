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

export const STATUSES = Object.keys(STATUS_LABEL) as Status[];

export const PLACEHOLDER_BANNER =
  "Placeholder requirements, not reviewed by a domain expert.";
export const SIMULATED_NOTE =
  "Simulated: answers come from a fixed script, not from a real model.";
export const DISCLAIMER =
  "This tool describes what the uploaded documents show. It is not an approval. A person must review and decide.";

export const RETENTION_TEXT = {
  label: "Delete data by",
  help: "The date by which this project's documents and stored text should be destroyed. Nothing is deleted automatically in this version.",
  placeholder: "Placeholder advice, not legal advice and not reviewed by a data protection specialist.",
  overdue:
    "The deletion date for this project has passed. Its documents and stored text should now be destroyed. This version cannot delete them for you: remove them by hand or ask your administrator.",
} as const;

export const VIEWER_TEXT = {
  note: "This is the text read from the PDF, with personal numbers hidden. It does not show the original layout.",
  legend: "Highlighted: the quote this finding is based on.",
  notFound: "The quote was not found on this page.",
  original: "Open the original PDF at this page",
  originalWarning: "The original may show personal numbers that are hidden here.",
} as const;

export const REQUEST_TEXT = {
  checkbox: "Ask the subcontractor for a new upload",
  reasonLabel: "Reason",
  reasonRequired: "(required when you change the result or ask for a new upload)",
  reasonOptional: "(optional when you confirm the result)",
  reasonPlaceholder: "Choose a reason…",
  emailLabel: "Also send the request by email",
  emailSimulated: "Simulated: a draft is recorded and nothing is sent.",
  noContact: "Add a contact email for this subcontractor to use this.",
  noContactHere: "No contact email is set for this subcontractor.",
  recorded: "A new upload was requested.",
  recordedEmail: "An email draft was recorded. Simulated: nothing was sent.",
  panelTitle: "New upload requested",
  draftHeading: "Email draft (simulated, not sent)",
  dashboardTitle: "Needs a new upload",
  dashboardEmpty: "Nothing needs a new upload right now.",
  dashboardHelp: "Requests stay here until a later decision on the same requirement does not ask for a new upload.",
  emailRecorded: "Request email recorded (simulated, nothing sent)",
  noEmail: "No email request",
  contactLabel: "Contact email (fictional)",
  contactHelp: "Fictional addresses only: ending in .example, .test or example.com.",
  commentRequired: "Your note (required when the reason is Other)",
  commentOptional: "Your note (optional)",
} as const;

export const SUMMARY_TEXT = {
  link: "View summary",
  back: "Back to the findings",
  reviewed: "reviewed by a person",
  notReviewed: "not yet reviewed",
  assessedBy: "Assessed by",
} as const;

/** Who or what produced each part of a finding. Shown on every finding and above the list. */
export const WHO = {
  model: { tag: "AI model", color: "bg-sky-100 text-sky-900 border-sky-300" },
  code: { tag: "Automatic code check", color: "bg-slate-100 text-slate-800 border-slate-300" },
  verifier: { tag: "AI model, second check", color: "bg-sky-100 text-sky-900 border-sky-300" },
  person: { tag: "A person", color: "bg-emerald-100 text-emerald-900 border-emerald-300" },
} as const;

export const WHO_TEXT = {
  model: "Reads the documents and proposes a status with quotes.",
  code: "Checks that every quote exists in the document text and that dates are inside a quote. It can only lower a status.",
  verifier: "Reads only the requirement and the verified quotes and says whether they support it. It can only lower a status.",
  person: "Makes the final decision. Every decision is logged with a reason.",
  scripted: "Simulated: these answers come from a fixed script, not from an AI model. Use it to see the screens, not to judge accuracy.",
} as const;

export const DECISION_TEXT = {
  question: "Do you agree with this result?",
  confirm: "Yes, the documents show this",
  change: "No, I read the documents differently",
  reasonLabel: "Your reason (required)",
  reasonPlaceholder: "Which part of the document supports your decision?",
} as const;

/** Words the UI must never use (CLAUDE.md). Tested against every string above. */
export const BANNED_WORDS = ["approved", "compliant", "qualified", "pass", "fail", "score"];
