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
  DecisionSchema,
  DocumentSchema,
  EngagementSchema,
  FindingSchema,
  ProjectDetailSchema,
  ProjectSchema,
  TemplateDetailSchema,
  TemplateSummarySchema,
  UploadResponseSchema,
  type Status,
} from "./schemas";

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

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
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
export const createProject = (name: string, templateId: string) =>
  request("/projects", ProjectSchema, json("POST", { name, template_id: templateId }));
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
export const decideFinding = (
  findingId: string,
  status: Status,
  comment: string,
  decidedBy: string,
) =>
  request(
    `/findings/${encodeURIComponent(findingId)}`,
    FindingSchema,
    json("PATCH", { status, comment, decided_by: decidedBy }),
  );
export const listDecisions = (findingId: string) =>
  request(`/findings/${encodeURIComponent(findingId)}/decisions`, z.array(DecisionSchema));
