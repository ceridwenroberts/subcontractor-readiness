"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, Hourglass, Play, Upload } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

import { ErrorBox, OverdueBanner } from "@/components/Banners";
import { useAssessments } from "@/components/AssessmentProvider";
import { DecisionHistory } from "@/components/DecisionHistory";
import { GlanceBadge } from "@/components/GlanceBadge";
import { NotAssessedAction } from "@/components/NotAssessedAction";
import { HowItWasMade } from "@/components/HowItWasMade";
import { MetricCard } from "@/components/MetricCard";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { RequirementReviewSheet } from "@/components/RequirementReviewSheet";
import { RequirementsTable } from "@/components/RequirementsTable";
import { StatusBadge } from "@/components/StatusBadge";
import { ScanTag, UploadDropzone, isScanWarning } from "@/components/UploadDropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getEngagement,
  getProject,
  getTemplate,
  getProjectOverview,
  listDocuments,
  listFindings,
  listRequestReasons,
} from "@/lib/api";
import { DISCLAIMER, REQUEST_TEXT, SUMMARY_TEXT } from "@/lib/labels";
import { queryKeys } from "@/lib/queries";
import type { Finding } from "@/lib/schemas";
import { useSession } from "@/lib/useSession";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export default function EngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ engagementId: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const { engagementId } = use(params);
  const { review: reviewParam } = use(searchParams);
  const queryClient = useQueryClient();
  const { user } = useSession();

  const engagementQ = useQuery({ queryKey: queryKeys.engagement(engagementId), queryFn: () => getEngagement(engagementId) });
  const engagement = engagementQ.data;
  const projectQ = useQuery({
    queryKey: queryKeys.project(engagement?.project_id ?? ""),
    queryFn: () => getProject(engagement?.project_id ?? ""),
    enabled: !!engagement,
  });
  const project = projectQ.data;
  const templateQ = useQuery({
    queryKey: queryKeys.template(project?.template_id ?? ""),
    queryFn: () => getTemplate(project?.template_id ?? ""),
    enabled: !!project,
  });
  const template = templateQ.data;
  const documentsQ = useQuery({ queryKey: queryKeys.documents(engagementId), queryFn: () => listDocuments(engagementId) });
  const findingsQ = useQuery({ queryKey: queryKeys.findings(engagementId), queryFn: () => listFindings(engagementId) });
  const overviewQ = useQuery({
    queryKey: queryKeys.overview(project?.id ?? ""),
    queryFn: () => getProjectOverview(project?.id ?? ""),
    enabled: !!project,
  });
  const reasonsQ = useQuery({ queryKey: queryKeys.reasons, queryFn: listRequestReasons, staleTime: Infinity });
  const documents = documentsQ.data ?? [];
  const findings = findingsQ.data ?? [];

  const { runs, errors, start } = useAssessments();
  const run = runs[engagementId];
  const assessing = !!run;
  const progress = run?.progress ?? null;
  const assessError = errors[engagementId] ?? null;
  const [uploading, setUploading] = useState(false);
  // A link from the summary page opens that requirement's panel straight away.
  const [reviewCode, setReviewCode] = useState<string | null>(reviewParam ?? null);

  const loadError = engagementQ.error ?? projectQ.error ?? templateQ.error ?? documentsQ.error ?? findingsQ.error;

  async function onAssess() {
    // Read the cache, not the render's copy: the upload toast keeps this function from before the upload.
    const current = queryClient.getQueryData<unknown[]>(queryKeys.documents(engagementId)) ?? documents;
    if (assessing || current.length === 0) return;
    setUploading(false);
    start({
      engagementId,
      projectId: project?.id ?? "",
      name: engagementQ.data?.subcontractor_name ?? "this subcontractor",
    });
  }

  function onFindingChanged(updated: Finding) {
    queryClient.setQueryData<Finding[]>(queryKeys.findings(engagementId), (prev) =>
      (prev ?? []).map((f) => (f.id === updated.id ? updated : f)),
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.openRequests });
    void queryClient.invalidateQueries({ queryKey: queryKeys.expiring });
    void queryClient.invalidateQueries({ queryKey: ["decisions"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.overview(project?.id ?? "") });
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Subcontractor" />
        <PageBody>
          <ErrorBox>{errorText(loadError)}</ErrorBox>
        </PageBody>
      </>
    );
  }
  if (!engagement || !template) {
    return (
      <>
        <PageHeader title="Subcontractor" />
        <PageBody>
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </PageBody>
      </>
    );
  }

  const hasDocuments = documents.length > 0;
  const mine = overviewQ.data?.engagements.find((e) => e.engagement_id === engagementId);
  // Required documents that are not there: no evidence was found, or nothing has been assessed yet.
  const documentsMissing = mine ? mine.counts.missing + mine.counts.not_assessed : null;
  const reviewing = template.requirements.find((r) => r.code === reviewCode) ?? null;
  const reviewingFinding = findings.find((f) => f.requirement_code === reviewCode) ?? null;
  const citedBy = (documentId: string) =>
    findings.filter((f) => f.evidence.some((e) => e.document_id === documentId && e.verified)).length;
  const byCode = new Map(findings.map((f) => [f.requirement_code, f]));

  return (
    <>
      <PageHeader title={engagement.subcontractor_name} subtitle={`Subcontractor · ${project?.name ?? ""}`} />
      <PageBody>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link href={`/projects/${engagement.project_id}`} className="hover:text-foreground">
            {project?.name ?? "Project"}
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="text-foreground">{engagement.subcontractor_name}</span>
        </nav>

        {project?.delete_overdue && <OverdueBanner date={project.delete_after} />}

        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            aria-hidden
          >
            {initials(engagement.subcontractor_name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">{engagement.subcontractor_name}</h2>
              {mine && mine.glance !== "not_assessed" && <GlanceBadge glance={mine.glance} />}
            </div>
            <p className="text-xs text-muted-foreground">
              Template: {template.name} ·{" "}
              {engagement.contact_email ? `Contact (fictional): ${engagement.contact_email}` : REQUEST_TEXT.noContactHere}
            </p>
          </div>
          <Button variant="outline" onClick={() => setUploading(true)}>
            <Upload className="size-3.5" aria-hidden />
            Upload documents
          </Button>
          <Button
            size="lg"
            onClick={onAssess}
            loading={assessing}
            loadingText="Assessing… please wait"
            unavailable={!hasDocuments && !assessing}
            unavailableReason="Upload at least one document first."
          >
            <Play className="size-3.5" aria-hidden />
            {findings.length ? "Assess again" : "Assess documents"}
            {hasDocuments ? ` (${documents.length})` : ""}
          </Button>
          {assessing && (
            <div role="status" aria-live="polite" className="w-full space-y-1.5 border-t border-border pt-3">
              <p className="text-sm">
                {progress && progress.index > 0
                  ? `Checking requirement ${progress.index} of ${progress.total}: ${progress.title}`
                  : "Starting…"}
              </p>
              <Progress value={progress ? (Math.max(0, progress.index - 1) / Math.max(1, progress.total)) * 100 : 0} />
              <p className="text-xs text-muted-foreground">
                Keep this page open. Nothing is saved until all of them are done.
                <span className="dev-only dev-ink"> Each requirement can take several seconds with a local model.</span>
              </p>
            </div>
          )}
          {!assessing && !hasDocuments && (
            <p className="w-full text-xs text-muted-foreground">Upload at least one document, then assess.</p>
          )}
          {!assessing && findings.length > 0 && (
            <p className="w-full text-xs text-muted-foreground">
              Assessing again adds new findings. Earlier findings and decisions stay in the decision log, but the table shows only the newest results.
            </p>
          )}
          {assessError && (
            <div className="w-full">
              <ErrorBox>{assessError}</ErrorBox>
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Status">
          <MetricCard
            icon={Hourglass}
            label="Waiting for your decision"
            value={mine ? mine.awaiting_decision : "—"}
            meta="Results with no decision yet"
          />
          <MetricCard
            icon={FileText}
            label="Documents missing"
            value={documentsMissing ?? "—"}
            meta="Requirements with no document showing evidence"
          />
          <MetricCard
            icon={Upload}
            label="New uploads requested"
            value={mine ? mine.open_requests : "—"}
            meta="Waiting for the subcontractor"
          />
        </section>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">
              Documents <span className="rounded-full bg-muted px-1.5 text-xs">{documents.length}</span>
            </TabsTrigger>
            <TabsTrigger value="requirements">
              Requirements <span className="rounded-full bg-muted px-1.5 text-xs">{template.requirements.length}</span>
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
              <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>Documentation status</CardTitle>
                    <CardDescription>
                      Every requirement in the {template.name} template. Open one to see the quote and record a decision.
                    </CardDescription>
                  </div>
                  {findings.length > 0 && (
                    <Link
                      href={`/engagements/${engagementId}/summary`}
                      className="text-xs underline underline-offset-2 hover:text-muted-foreground"
                    >
                      {SUMMARY_TEXT.link}
                    </Link>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border">
                    {template.requirements.map((r) => {
                      const f = byCode.get(r.code);
                      return (
                        <li key={r.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-4 transition-colors hover:bg-subtle">
                          <button
                            type="button"
                            onClick={() => setReviewCode(r.code)}
                            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-2.5 pl-4 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">
                                <span className="mr-1.5 font-mono text-xs font-normal text-muted-foreground">{r.code}</span>
                                {r.title}
                                {!r.mandatory && <span className="text-xs font-normal text-muted-foreground"> (optional)</span>}
                              </span>
                              <span className="block text-xs text-muted-foreground">{r.description}</span>
                            </span>
                            {f && <StatusBadge status={f.ai_status} short />}
                            {f?.human_status && <StatusBadge status={f.human_status} prefix="Decision" short />}
                            {f && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
                          </button>
                          {!f && (
                            <NotAssessedAction
                              documentCount={documents.length}
                              assessing={assessing}
                              onUpload={() => setUploading(true)}
                              onAssess={onAssess}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>

              <aside className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Subcontractor information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Company</dt>
                        <dd>{engagement.subcontractor_name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Contact email (fictional)</dt>
                        <dd>{engagement.contact_email ?? REQUEST_TEXT.noContactHere}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Project</dt>
                        <dd>{project?.name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Template</dt>
                        <dd>
                          {template.name} (version {template.version})
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
                {findings.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>About these results</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <HowItWasMade findings={findings} />
                      <p className="mt-2 text-xs text-muted-foreground">
                        Each result comes from the documents, then automatic checks, then a person.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Uploaded documents</CardTitle>
                  <CardDescription>Each file is listed on its own. Open one to read its text.</CardDescription>
                </div>
                <Button size="sm" onClick={() => setUploading(true)}>
                  <Upload className="size-3.5" aria-hidden />
                  Upload documents
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {documents.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">Nothing uploaded yet.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {documents.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {d.filename}{" "}
                            <span className="font-normal text-muted-foreground">
                              {d.page_count} page{d.page_count === 1 ? "" : "s"}
                            </span>
                          </p>
                          {d.warnings.map((w, j) =>
                            isScanWarning(w) ? (
                              <div key={j} className="mt-1">
                                <ScanTag warning={w} />
                              </div>
                            ) : (
                              <p key={j} className="text-xs text-muted-foreground">
                                Note: {w}
                              </p>
                            ),
                          )}
                        </div>
                        <Link href={`/documents/${d.id}`} className="text-xs underline underline-offset-2 hover:text-muted-foreground">
                          {citedBy(d.id) === 0
                            ? "Not cited by any requirement"
                            : `Cited by ${citedBy(d.id)} requirement${citedBy(d.id) === 1 ? "" : "s"}`}
                          {" · Review text"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requirements">
            <Card>
              <CardHeader>
                <CardTitle>Required documents and results{findings.length > 0 ? ` (${findings.length})` : ""}</CardTitle>
              </CardHeader>
              <CardContent>
                <RequirementsTable
                  template={template}
                  findings={findings}
                  documents={documents}
                  onReview={setReviewCode}
                  onUpload={() => setUploading(true)}
                  onAssess={onAssess}
                  assessing={assessing}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Decision history</CardTitle>
                <CardDescription>Every decision recorded on this subcontractor&apos;s results. It is never edited.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <DecisionHistory findings={findings} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">{DISCLAIMER}</p>
      </PageBody>

      <Dialog open={uploading} onOpenChange={setUploading}>
        <DialogContent className="max-w-xl">
          <div>
            <DialogTitle>Upload documents</DialogTitle>
            <DialogDescription>Add PDF documentation for {engagement.subcontractor_name}.</DialogDescription>
          </div>
          <UploadDropzone
            engagementId={engagementId}
            documents={documents}
            listUploaded={false}
            onUploaded={async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.documents(engagementId) });
              void queryClient.invalidateQueries({ queryKey: queryKeys.overview(project?.id ?? "") });
            }}
            onAssess={onAssess}
          />
          <div className="flex justify-end border-t border-border pt-3">
            <Button variant="outline" onClick={() => setUploading(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <RequirementReviewSheet
        requirement={reviewing}
        finding={reviewingFinding}
        user={user}
        contactEmail={engagement.contact_email}
        reasons={reasonsQ.data ?? []}
        onChanged={onFindingChanged}
        onClose={() => setReviewCode(null)}
      />
    </>
  );
}
