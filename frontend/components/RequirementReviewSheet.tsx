"use client";

import { FindingCard } from "@/components/FindingCard";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Finding, Reason, TemplateDetail, User } from "@/lib/schemas";

type Requirement = TemplateDetail["requirements"][number];

/** The review panel beside the page: what the requirement means, the result, and the decision. */
export function RequirementReviewSheet({
  requirement,
  finding,
  user,
  contactEmail,
  reasons,
  onChanged,
  onClose,
}: {
  requirement: Requirement | null;
  finding: Finding | null;
  user: User | null;
  contactEmail: string | null;
  reasons: Reason[];
  onChanged: (updated: Finding) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!requirement} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-w-xl overflow-y-auto">
        {requirement && (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Requirement review</p>
              <SheetTitle className="text-base">
                <span className="mr-1.5 font-mono text-xs font-normal text-muted-foreground">{requirement.code}</span>
                {requirement.title}
                {!requirement.mandatory && <span className="text-xs font-normal text-muted-foreground"> (optional)</span>}
              </SheetTitle>
              <SheetDescription>{requirement.description}</SheetDescription>
              {requirement.evidenceHints.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  The check looks for words such as: {requirement.evidenceHints.join(", ")}.
                </p>
              )}
              {requirement.expires && (
                <p className="mt-1 text-xs text-muted-foreground">
                  This document has an expiry date. A date that has ended is shown as such.
                </p>
              )}
            </div>
            {finding ? (
              <FindingCard
                finding={finding}
                user={user}
                contactEmail={contactEmail}
                reasons={reasons}
                onChanged={onChanged}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                Not assessed yet. Upload documents and choose “Assess documents” to see a result here.
              </p>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
