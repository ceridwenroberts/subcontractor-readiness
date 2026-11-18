"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";

import { useAssessments } from "@/components/AssessmentProvider";

/** Shows an assessment that is still running, wherever the person is in the app. */
export function AssessmentStatus() {
  const { runs } = useAssessments();
  const list = Object.values(runs);
  if (list.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="space-y-1 rounded-md border border-border bg-background p-2 text-xs">
      {list.map((r) => (
        <Link key={r.engagementId} href={`/engagements/${r.engagementId}`} className="flex items-start gap-1.5 hover:underline">
          <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" aria-hidden />
          <span>
            Assessing {r.name}
            {r.progress && r.progress.index > 0 ? `: ${r.progress.index} of ${r.progress.total}` : "…"}
          </span>
        </Link>
      ))}
      <p className="text-muted-foreground">Keep the browser tab open until it finishes.</p>
    </div>
  );
}
