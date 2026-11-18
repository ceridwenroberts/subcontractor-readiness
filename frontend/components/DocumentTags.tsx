"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { RequirementPicker, type PickerRequirement } from "@/components/RequirementPicker";
import { Button } from "@/components/ui/button";
import { updateDocumentTags } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { DocumentInfo } from "@/lib/schemas";

/** Shows which requirements a document is for, and lets the PM change it for the next assessment. */
export function DocumentTags({
  document,
  engagementId,
  projectId,
  requirements,
}: {
  document: DocumentInfo;
  engagementId: string;
  projectId: string;
  requirements: PickerRequirement[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [codes, setCodes] = useState(document.requirement_codes);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateDocumentTags(document.id, codes);
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents(engagementId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview(projectId) });
      toast("Saved. It applies the next time you assess.");
      setEditing(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The change could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>
          Used for:{" "}
          <span className="text-foreground">
            {document.requirement_codes.length === 0 ? "not sure, checked for every requirement" : document.requirement_codes.join(", ")}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            setCodes(document.requirement_codes);
            setEditing(true);
          }}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Change
        </button>
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <RequirementPicker requirements={requirements} value={codes} onChange={setCodes} disabled={saving} />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} loading={saving} loadingText="Saving…">
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">Applies from the next assessment.</span>
      </div>
    </div>
  );
}
