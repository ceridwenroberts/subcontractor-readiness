"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Play } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";

import { ErrorBox, OverdueBanner, PlaceholderBanner } from "@/components/Banners";
import { HowItWasMade } from "@/components/HowItWasMade";
import { RequirementsTable } from "@/components/RequirementsTable";
import { UploadDropzone } from "@/components/UploadDropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  assessEngagementStream,
  type AssessProgress,
  getEngagement,
  getProject,
  getTemplate,
  listDocuments,
  listFindings,
  listRequestReasons,
} from "@/lib/api";
import { DISCLAIMER, REQUEST_TEXT, SUMMARY_TEXT } from "@/lib/labels";
import { queryKeys } from "@/lib/queries";
import type { Finding } from "@/lib/schemas";
import { useSession } from "@/lib/useSession";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function EngagementPage({ params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = use(params);
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
  const reasonsQ = useQuery({ queryKey: queryKeys.reasons, queryFn: listRequestReasons, staleTime: Infinity });
  const documents = documentsQ.data ?? [];
  const findings = findingsQ.data ?? [];

  const [assessing, setAssessing] = useState(false);
  const [progress, setProgress] = useState<AssessProgress | null>(null);
  const [assessError, setAssessError] = useState<string | null>(null);

  const loadError = engagementQ.error ?? projectQ.error ?? templateQ.error ?? documentsQ.error ?? findingsQ.error;

  async function onAssess() {
    if (assessing || documents.length === 0) return;
    setAssessing(true);
    setAssessError(null);
    setProgress(null);
    try {
      const result = await assessEngagementStream(engagementId, setProgress);
      queryClient.setQueryData(queryKeys.findings(engagementId), result);
      toast(`Assessment finished: ${result.length} requirements checked.`);
    } catch (err) {
      setAssessError(errorText(err));
    } finally {
      setAssessing(false);
      setProgress(null);
    }
  }

  function onFindingChanged(updated: Finding) {
    queryClient.setQueryData<Finding[]>(queryKeys.findings(engagementId), (prev) =>
      (prev ?? []).map((f) => (f.id === updated.id ? updated : f)),
    );
  }

  if (loadError) return <ErrorBox>{errorText(loadError)}</ErrorBox>;
  if (!engagement || !template) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const hasDocuments = documents.length > 0;
  const assessLabel = findings.length ? "Assess again" : "Assess documents";

  return (
    <main className="space-y-5">
      <Link
        href={`/projects/${engagement.project_id}`}
        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Back to project
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{engagement.subcontractor_name}</h1>
        <p className="text-xs text-muted-foreground">
          Template: {template.name} ·{" "}
          {engagement.contact_email ? `Contact (fictional): ${engagement.contact_email}` : REQUEST_TEXT.noContactHere}
        </p>
      </div>
      {template.placeholder && <PlaceholderBanner />}
      {project?.delete_overdue && <OverdueBanner date={project.delete_after} />}

      <Card>
        <CardHeader>
          <CardTitle>1. Upload documents</CardTitle>
          <CardDescription>
            Add the subcontractor&apos;s PDFs. Each file is listed on its own so you can review it after uploading.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadDropzone
            engagementId={engagementId}
            documents={documents}
            onUploaded={async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.documents(engagementId) });
            }}
            onAssess={onAssess}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Assess</CardTitle>
          <CardDescription>
            Each requirement is checked against the uploaded documents, and every quote is verified against the stored
            text.
            <span className="dev-only dev-ink"> With a local model this can take about a minute.</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              onClick={onAssess}
              loading={assessing}
              loadingText="Assessing… please wait"
              unavailable={!hasDocuments && !assessing}
              unavailableReason="Upload at least one document first."
            >
              <Play className="size-3.5" aria-hidden />
              {assessLabel}
              {hasDocuments ? ` (${documents.length} document${documents.length === 1 ? "" : "s"})` : ""}
            </Button>
            {!hasDocuments && <p className="text-xs text-muted-foreground">Upload at least one document first.</p>}
          </div>
          {assessing && (
            <div role="status" aria-live="polite" className="space-y-1.5">
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
          {assessError && <ErrorBox>{assessError}</ErrorBox>}
          {findings.length > 0 && !assessing && (
            <p className="text-xs text-muted-foreground">
              Assessing again adds new findings. Earlier findings and your decisions on them are kept.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>3. Required documents and results{findings.length > 0 ? ` (${findings.length})` : ""}</CardTitle>
          {findings.length > 0 && (
            <Link
              href={`/engagements/${engagementId}/summary`}
              className="text-xs text-foreground underline underline-offset-2 hover:text-muted-foreground"
            >
              {SUMMARY_TEXT.link}
            </Link>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {findings.length > 0 && <HowItWasMade findings={findings} />}
          <RequirementsTable
            template={template}
            findings={findings}
            documents={documents}
            user={user}
            contactEmail={engagement.contact_email}
            reasons={reasonsQ.data ?? []}
            onChanged={onFindingChanged}
          />
        </CardContent>
      </Card>

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">{DISCLAIMER}</p>
    </main>
  );
}
