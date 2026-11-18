"use client";

import { Play, Upload } from "lucide-react";
import Link from "next/link";

import { useAssessments } from "@/components/AssessmentProvider";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Shown in place of "Not assessed yet". With documents it starts the assessment right here and
 * shows progress in the button. Without documents there is nothing to assess, so it leads to the
 * upload instead.
 */
export function AssessRowButton({
  engagementId,
  projectId,
  documentCount,
  name,
}: {
  engagementId: string;
  projectId: string;
  documentCount: number | undefined;
  name: string;
}) {
  const { runs, start } = useAssessments();
  const run = runs[engagementId];
  const busy = !!run;
  const progress = run?.progress ?? null;

  if (documentCount === 0) {
    return (
      <Link
        href={`/engagements/${engagementId}`}
        onClick={(e) => e.stopPropagation()}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Upload className="size-3.5" aria-hidden />
        Upload documents
      </Link>
    );
  }

  return (
    <Button
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        start({ engagementId, projectId, name });
      }}
      loading={busy}
      loadingText={progress && progress.index > 0 ? `Checking ${progress.index} of ${progress.total}…` : "Starting…"}
      unavailable={documentCount === undefined}
      unavailableReason="Loading the document count."
    >
      <Play className="size-3.5" aria-hidden />
      Assess documents
    </Button>
  );
}
