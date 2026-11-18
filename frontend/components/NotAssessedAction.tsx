"use client";

import { Play, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * What to show for a requirement that has no result yet. There is never a "not assessed" label:
 * a requirement with no document has nothing to assess, so the action is to upload one, and a
 * requirement with a document (tagged for it, or untagged) is ready to assess.
 */
export function NotAssessedAction({
  hasDocument,
  assessing,
  onUpload,
  onAssess,
}: {
  hasDocument: boolean;
  assessing: boolean;
  onUpload: () => void;
  onAssess: () => void;
}) {
  if (!hasDocument) {
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
