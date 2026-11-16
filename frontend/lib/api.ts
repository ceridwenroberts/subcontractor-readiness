/**
 * The only place the frontend talks to the backend.
 * Every response is checked with a zod schema before the UI sees it.
 */
import { z } from "zod";

// NEXT_PUBLIC_ values are compiled into browser JavaScript: never put a secret here.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const HealthSchema = z.object({ status: z.literal("ok") });
export type Health = z.infer<typeof HealthSchema>;

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`${path}: HTTP ${res.status}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`${path}: response is not JSON`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`${path}: unexpected response shape`);
  }
  return parsed.data;
}

export function getHealth(): Promise<Health> {
  return getJson("/health", HealthSchema);
}

// ---------------------------------------------------------------------------
// Everything below talks to the workflow endpoints. getHealth above is unchanged.

import {
  AssessEventSchema,
  DecisionSchema,
  DocumentPagesSchema,
  DocumentSchema,
  EngagementSchema,
  FindingSchema,
  ProjectDetailSchema,
  ProjectSchema,
  RetentionAdviceSchema,
  SignInSchema,
  UserSchema,
  TemplateDetailSchema,
  TemplateSummarySchema,
  UploadResponseSchema,
  type Finding,
  type Status,
} from "./schemas";
import { getToken } from "./token";

/** An error whose message is safe and useful to show to the PM. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Pick the friendliest message the backend gave us, falling back to plain wording. */
export function messageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string" && b.message) return b.message;
    if (typeof b.detail === "string" && b.detail) return b.detail;
    if (Array.isArray(b.detail)) return "Please check the form: a field is missing or too long.";
  }
  if (status >= 500) return "Something went wrong on our side. Nothing was saved.";
  return `The request failed (${status}).`;
}

/** Add the simulated sign-in token, if there is one, without changing other options. */
function withToken(init?: RequestInit): RequestInit | undefined {
  const token = getToken();
  if (!token) return init;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, withToken(init));
  } catch {
    throw new ApiError(
      "Cannot reach the backend. Check that it is running on this computer, then try again.",
      0,
    );
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // a non-JSON body is handled below
  }
  if (!res.ok) throw new ApiError(messageFromBody(body, res.status), res.status, body);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("The backend answered in an unexpected format.", res.status);
  return parsed.data;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const listTemplates = () => request("/templates", z.array(TemplateSummarySchema));
export const getTemplate = (id: string) =>
  request(`/templates/${encodeURIComponent(id)}`, TemplateDetailSchema);

export const listProjects = () => request("/projects", z.array(ProjectSchema));
export const getRetentionAdvice = () => request("/retention", RetentionAdviceSchema);
export const createProject = (name: string, templateId: string, deleteAfter?: string) =>
  request(
    "/projects",
    ProjectSchema,
    json("POST", {
      name,
      template_id: templateId,
      ...(deleteAfter ? { delete_after: deleteAfter } : {}),
    }),
  );
export const getProject = (id: string) =>
  request(`/projects/${encodeURIComponent(id)}`, ProjectDetailSchema);
export const createEngagement = (projectId: string, subcontractorName: string) =>
  request(
    `/projects/${encodeURIComponent(projectId)}/engagements`,
    EngagementSchema,
    json("POST", { subcontractor_name: subcontractorName }),
  );
export const getEngagement = (id: string) =>
  request(`/engagements/${encodeURIComponent(id)}`, EngagementSchema);

export const listDocuments = (engagementId: string) =>
  request(`/engagements/${encodeURIComponent(engagementId)}/documents`, z.array(DocumentSchema));

/** Upload PDFs. A 400 with per-file reasons is returned, not thrown, so the UI can list them. */
export async function uploadDocuments(engagementId: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  try {
    return await request(
      `/engagements/${encodeURIComponent(engagementId)}/documents`,
      UploadResponseSchema,
      { method: "POST", body: form },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      const parsed = UploadResponseSchema.safeParse(err.body);
      if (parsed.success) return { ...parsed.data, message: parsed.data.message ?? err.message };
    }
    throw err;
  }
}

export const assessEngagement = (engagementId: string) =>
  request(
    `/engagements/${encodeURIComponent(engagementId)}/assess`,
    z.array(FindingSchema),
    { method: "POST" },
  );
export const listFindings = (engagementId: string) =>
  request(`/engagements/${encodeURIComponent(engagementId)}/findings`, z.array(FindingSchema));
/** The name in the decision log comes from the signed-in session on the server, not from here. */
export const decideFinding = (findingId: string, status: Status, comment: string) =>
  request(
    `/findings/${encodeURIComponent(findingId)}`,
    FindingSchema,
    json("PATCH", { status, comment }),
  );
export const listDecisions = (findingId: string) =>
  request(`/findings/${encodeURIComponent(findingId)}/decisions`, z.array(DecisionSchema));

// Simulated sign-in (see lib/token.ts).
export const listDemoUsers = () => request("/session/users", z.array(UserSchema));
export const signIn = (userId: string) =>
  request("/session", SignInSchema, json("POST", { user_id: userId }));
export const getMe = () => request("/session/me", UserSchema);
export const signOut = () => request("/session", z.null(), { method: "DELETE" });

/** Redacted page text for the viewer. */
export const getDocumentPages = (documentId: string) =>
  request(`/documents/${encodeURIComponent(documentId)}/pages`, DocumentPagesSchema);

/** Link to the ORIGINAL PDF, which may show personal numbers the viewer hides. */
export const documentFileUrl = (documentId: string, page: number) =>
  `${API_URL}/documents/${encodeURIComponent(documentId)}/file#page=${page}`;

/** Link to the viewer page for a quote. The quote is redacted text, already stored. */
export const viewerPath = (documentId: string, page: number, quote: string) =>
  `/documents/${encodeURIComponent(documentId)}?page=${page}&quote=${encodeURIComponent(quote)}`;

export type AssessProgress = { index: number; total: number; title: string };

/**
 * Assess an engagement and report progress. `onProgress` is called with index 0 when the
 * run starts, then once before each requirement. Resolves with the findings. Nothing is
 * saved by the backend unless every requirement finishes.
 */
export async function assessEngagementStream(
  engagementId: string,
  onProgress: (p: AssessProgress) => void,
): Promise<Finding[]> {
  let res: Response;
  try {
    res = await fetch(
      `${API_URL}/engagements/${encodeURIComponent(engagementId)}/assess/stream`,
      withToken({ method: "POST" }),
    );
  } catch {
    throw new ApiError(
      "Cannot reach the backend. Check that it is running on this computer, then try again.",
      0,
    );
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // handled by messageFromBody
    }
    throw new ApiError(messageFromBody(body, res.status), res.status, body);
  }
  if (!res.body) throw new ApiError("The backend answered in an unexpected format.", res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let findings: Finding[] | null = null;

  const handle = (line: string) => {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new ApiError("The backend answered in an unexpected format.", res.status);
    }
    const event = AssessEventSchema.safeParse(raw);
    if (!event.success) throw new ApiError("The backend answered in an unexpected format.", res.status);
    const e = event.data;
    if (e.type === "start") onProgress({ index: 0, total: e.total, title: "" });
    else if (e.type === "working") onProgress({ index: e.index, total: e.total, title: e.title });
    else if (e.type === "done") findings = e.findings;
    else throw new ApiError(e.message, e.status);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) handle(line);
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  if (buffer.trim()) handle(buffer.trim());
  if (!findings) throw new ApiError("The assessment ended unexpectedly. Nothing was saved.", 0);
  return findings;
}
