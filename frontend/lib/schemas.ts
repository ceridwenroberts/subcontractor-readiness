/** zod schemas for every backend response. The UI only sees data that passed these. */
import { z } from "zod";

export const StatusSchema = z.enum(["found", "partial", "missing", "unclear", "expired"]);
export type Status = z.infer<typeof StatusSchema>;

export const TemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  reviewed_by: z.string().nullable(),
  placeholder: z.boolean(),
  requirement_count: z.number(),
});
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;

export const TemplateDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  reviewedBy: z.string().nullable(),
  placeholder: z.boolean(),
  requirements: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      description: z.string(),
      mandatory: z.boolean(),
      expires: z.boolean(),
      evidenceHints: z.array(z.string()),
    }),
  ),
});
export type TemplateDetail = z.infer<typeof TemplateDetailSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  template_id: z.string(),
  delete_after: z.string().nullable(),
  delete_overdue: z.boolean(),
  created_at: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const EngagementSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  subcontractor_name: z.string(),
  org_number: z.string().nullable(),
  created_at: z.string(),
});
export type Engagement = z.infer<typeof EngagementSchema>;

export const ProjectDetailSchema = ProjectSchema.extend({
  engagements: z.array(EngagementSchema),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  page_count: z.number(),
  redaction_count: z.number(),
  warnings: z.array(z.string()),
  created_at: z.string(),
});
export type DocumentInfo = z.infer<typeof DocumentSchema>;

export const FileReportSchema = z.object({
  filename: z.string(),
  status: z.enum(["accepted", "rejected"]),
  document_id: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  hint: z.string().nullable().optional(),
  warnings: z.array(z.string()),
});
export type FileReport = z.infer<typeof FileReportSchema>;

export const UploadResponseSchema = z.object({
  files: z.array(FileReportSchema),
  message: z.string().nullable().optional(),
});
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

export const EvidenceSchema = z.object({
  document_id: z.string(),
  document_name: z.string(),
  page: z.number(),
  quote: z.string(),
  verified: z.boolean(),
});

export const FindingSchema = z.object({
  id: z.string(),
  engagement_id: z.string(),
  requirement_code: z.string(),
  requirement_title: z.string(),
  mandatory: z.boolean(),
  model_status: StatusSchema,
  ai_status: StatusSchema,
  human_status: StatusSchema.nullable(),
  evidence: z.array(EvidenceSchema),
  valid_until: z.string().nullable(),
  notes: z.string(),
  provider: z.string(),
  provider_label: z.string(),
  model: z.string(),
  prompt_version: z.string(),
  created_at: z.string(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const DecisionSchema = z.object({
  id: z.string(),
  finding_id: z.string(),
  old_human_status: StatusSchema.nullable(),
  new_human_status: StatusSchema,
  comment: z.string(),
  decided_by: z.string(),
  decided_at: z.string(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const RetentionAdviceSchema = z.object({
  reviewed_by: z.string().nullable(),
  placeholder: z.boolean(),
  suggested_date: z.string(),
  summary: z.string(),
  basis: z.array(z.string()),
  caveats: z.array(z.string()),
});
export type RetentionAdvice = z.infer<typeof RetentionAdviceSchema>;

export const UserSchema = z.object({ id: z.string(), name: z.string() });
export type User = z.infer<typeof UserSchema>;

export const SignInSchema = z.object({ token: z.string(), user: UserSchema });

export const DocumentPagesSchema = z.object({
  id: z.string(),
  engagement_id: z.string(),
  filename: z.string(),
  page_count: z.number(),
  pages: z.array(z.string()),
});
export type DocumentPages = z.infer<typeof DocumentPagesSchema>;
