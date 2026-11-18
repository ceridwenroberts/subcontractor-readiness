"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Play, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { assessEngagementStream, type AssessProgress } from "@/lib/api";
import { queryKeys } from "@/lib/queries";

/**
 * Shown in place of "Not assessed yet". With documents it starts the assessment right here and
 * shows progress in the button. Without documents there is nothing to assess, so it leads to the
 * upload instead.
 */
export function AssessRowButton({
  engagementId,
  projectId,
  documentCount,
}: {
  engagementId: string;
  projectId: string;
  documentCount: number | undefined;
}) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<AssessProgress | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await assessEngagementStream(engagementId, setProgress);
      queryClient.setQueryData(queryKeys.findings(engagementId), result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.openRequests });
      void queryClient.invalidateQueries({ queryKey: queryKeys.expiring });
      toast(`Assessment finished: ${result.length} requirements checked.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The assessment could not be completed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Button
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        void run();
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
