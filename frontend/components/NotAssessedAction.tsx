"use client";

import { Play, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * What to show for a requirement that has no result yet. There is never a "not assessed" label:
 * with no document there is nothing to assess, so the action is to upload one, and with
 * documents the action is to assess them.
 */
export function NotAssessedAction({
  documentCount,
  assessing,
  onUpload,
  onAssess,
}: {
  documentCount: number;
  assessing: boolean;
  onUpload: () => void;
  onAssess: () => void;
}) {
  if (documentCount === 0) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          onUpload();
        }}
      >
        <Upload className="size-3.5" aria-hidden />
        Upload documents
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      loading={assessing}
      loadingText="Assessing…"
      onClick={(e) => {
        e.stopPropagation();
        onAssess();
      }}
    >
      <Play className="size-3.5" aria-hidden />
      Assess
    </Button>
  );
}
