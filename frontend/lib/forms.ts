/**
 * Input rules for the forms, written once with zod. The backend stays the authority: it
 * re-checks everything. These rules only give the person an early, specific message.
 * Keep the limits and the fictional-address rule in step with backend/app/config.py and
 * backend/app/upload_requests.py (tests below pin the examples).
 */
import { z } from "zod";

export const LIMITS = {
  maxFileMb: 10,
  maxFiles: 10,
  nameMax: 200,
} as const;

// Reserved, never-real domains (RFC 2606 and RFC 6761), same as the backend.
const RESERVED_SUFFIXES = [".example", ".test", ".invalid", ".localhost"];
const RESERVED_DOMAINS = ["example.com", "example.org", "example.net"];
const SHAPE = /^[^@\s]+@([^@\s]+\.[^@\s]+|[^@\s]+)$/;

export const ADDRESS_RULE =
  "Use a fictional address ending in .example, .test or example.com. Real addresses are not allowed in this version.";

export function isFictionalAddress(address: string): boolean {
  const match = SHAPE.exec(address.trim());
  if (!match) return false;
  const domain = match[1].toLowerCase();
  return (
    RESERVED_DOMAINS.includes(domain) ||
    RESERVED_SUFFIXES.some((s) => domain.endsWith(s)) ||
    RESERVED_DOMAINS.some((d) => domain.endsWith(`.${d}`))
  );
}

const name = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${what}.`)
    .max(LIMITS.nameMax, `Use at most ${LIMITS.nameMax} characters.`);

/** Date as YYYY-MM-DD, today or later. `today` is passed in so this stays testable. */
export function projectSchema(today: string) {
  return z.object({
    name: name("a project name"),
    templateId: z.string().min(1, "Choose a template."),
    deleteAfter: z
      .string()
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a date.")
      .refine((v) => v === "" || v >= today, "The deletion date must be today or later."),
  });
}
export type ProjectInput = z.infer<ReturnType<typeof projectSchema>>;

export const subcontractorSchema = z.object({
  name: name("the subcontractor's name"),
  contactEmail: z
    .string()
    .trim()
    .max(LIMITS.nameMax, `Use at most ${LIMITS.nameMax} characters.`)
    .refine((v) => v === "" || SHAPE.test(v), "Enter an email address, for example name@company.example.")
    .refine((v) => v === "" || !SHAPE.test(v) || isFictionalAddress(v), ADDRESS_RULE),
});
export type SubcontractorInput = z.infer<typeof subcontractorSchema>;

export const signInSchema = z.object({
  userId: z.string().min(1, "Choose who you are signing in as."),
});

export type FileLike = { name: string; size: number; type?: string };

export type FileProblem =
  | "not_pdf"
  | "too_big"
  | "empty"
  | "duplicate_in_batch"
  | "already_uploaded"
  | "too_many";

export const FILE_PROBLEM_TEXT: Record<FileProblem, string> = {
  not_pdf: "Only PDF files are accepted.",
  too_big: `The file is larger than ${LIMITS.maxFileMb} MB.`,
  empty: "The file is empty.",
  duplicate_in_batch: "This file is already in the list.",
  already_uploaded: "A file with this name and size was already uploaded. Upload it again only if it is a new version.",
  too_many: `Only ${LIMITS.maxFiles} files can be uploaded at a time.`,
};

export type FileCheck = { file: FileLike; problem: FileProblem | null };

const sameFile = (a: FileLike, b: FileLike) => a.name === b.name && a.size === b.size;

/**
 * Early checks on picked files. "already_uploaded" matches by name and size only, which is a
 * hint, not proof: the person may still choose to upload. The other problems block the file.
 */
export function checkFiles(picked: FileLike[], uploaded: { name: string; size?: number }[]): FileCheck[] {
  const seen: FileLike[] = [];
  let kept = 0;
  return picked.map((file) => {
    let problem: FileProblem | null = null;
    const isPdf = (file.type ?? "") === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) problem = "not_pdf";
    else if (file.size === 0) problem = "empty";
    else if (file.size > LIMITS.maxFileMb * 1024 * 1024) problem = "too_big";
    else if (seen.some((s) => sameFile(s, file))) problem = "duplicate_in_batch";
    else if (kept >= LIMITS.maxFiles) problem = "too_many";
    else if (uploaded.some((u) => u.name === file.name && (u.size === undefined || u.size === file.size)))
      problem = "already_uploaded";
    seen.push(file);
    if (problem === null || problem === "already_uploaded") kept += 1;
    return { file, problem };
  });
}

/** Problems that stop a file from being sent. A possible duplicate only warns. */
export const isBlocking = (problem: FileProblem | null): boolean =>
  problem !== null && problem !== "already_uploaded";

/** First message per field, ready to show under each input. */
export function fieldErrors<T extends string>(error: z.ZodError): Partial<Record<T, string>> {
  const out: Partial<Record<T, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in out)) out[key as T] = issue.message;
  }
  return out;
}
