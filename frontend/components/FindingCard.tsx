"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DecisionDisclosure } from "@/components/DecisionDisclosure";
import { DecisionForm } from "@/components/DecisionForm";
import { EmailDraftSheet } from "@/components/EmailDraftSheet";
import { NoDocumentBadge, isNoDocument } from "@/components/NoDocumentBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { viewerPath } from "@/lib/api";
import { REQUEST_TEXT, STATUS_LABEL, WHO } from "@/lib/labels";
import { verifierOutcome } from "@/lib/provenance";
import type { Finding, Reason, User } from "@/lib/schemas";
import { formatWhen } from "@/lib/time";

function Tag({ part }: { part: keyof typeof WHO }) {
  return <Badge variant="model">{WHO[part].tag}</Badge>;
}

function Step({ part, children }: { part: keyof typeof WHO; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <Tag part={part} />
      <span>{children}</span>
    </li>
  );
}

/** One requirement's result: the quotes, any new-upload request, and the decision. */
export function FindingCard({
  finding,
  user,
  contactEmail,
  reasons,
  onChanged,
}: {
  finding: Finding;
  user: User | null;
  contactEmail: string | null;
  reasons: Reason[];
  onChanged: (updated: Finding) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);

  const verifier = verifierOutcome(finding);
  const modelDiffers = finding.model_status !== finding.ai_status;
  const request = finding.latest_request;
  const decided = !!finding.human_status;
  const showForm = !decided || editing;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {isNoDocument(finding) ? <NoDocumentBadge /> : <StatusBadge status={finding.ai_status} />}
        {finding.human_status && !isNoDocument(finding) && (
          <StatusBadge status={finding.human_status} prefix="Your decision" />
        )}
        <Badge variant="model" title="Where this result came from">
          {finding.provider_label}
        </Badge>
      </div>

      <div className="space-y-2">
        {finding.evidence.length === 0 && (
          <p className="text-sm text-muted-foreground">No quote is attached to this finding.</p>
        )}
        {finding.evidence.map((e, i) => (
          <figure key={i} className="rounded-md border border-border bg-subtle px-3 py-2 text-sm">
            <blockquote className="whitespace-pre-wrap break-words">&ldquo;{e.quote}&rdquo;</blockquote>
            <figcaption className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                {e.document_name}, page {e.page}
              </span>
              <Link
                href={viewerPath(e.document_id, e.page, e.quote)}
                className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2 hover:text-muted-foreground"
              >
                View in document
                <ExternalLink className="size-3" aria-hidden />
              </Link>
              <span className={e.verified ? "" : "font-medium text-foreground"}>
                {e.verified
                  ? "quote found in the document text"
                  : "quote not found in the document text, so it is not used as evidence"}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      {finding.valid_until && <p className="text-sm">Date shown in the documents: {finding.valid_until}</p>}
      {finding.notes && <p className="dev-only dev-ink text-xs">{finding.notes}</p>}

      {request && (
        <div className="rounded-md border border-border bg-subtle px-3 py-2 text-sm">
          <p className="font-medium">
            {REQUEST_TEXT.panelTitle}: {request.reason_label}
          </p>
          <p className="text-xs text-muted-foreground">
            {request.requested_by} · {formatWhen(request.created_at)} ·{" "}
            {request.email_recorded ? REQUEST_TEXT.emailRecorded : REQUEST_TEXT.noEmail}
          </p>
          {request.email_recorded && (
            <div className="mt-2">
              <EmailDraftSheet
                heading={REQUEST_TEXT.draftHeading}
                to={request.email_to}
                subject={request.email_subject}
                body={request.email_body}
                trigger="View email draft"
              />
            </div>
          )}
        </div>
      )}

      <details className="dev-only text-xs">
        <summary className="dev-ink select-none">
          How this result was made{modelDiffers ? " · adjusted by automatic checks" : ""}
        </summary>
        <ol className="dev-surface mt-2 space-y-1.5 rounded-md border p-3 text-foreground">
          {finding.provider === "none" ? (
            <Step part="code">No document was uploaded for this requirement, so no model was asked.</Step>
          ) : (
            <Step part="model">
              {finding.provider_label} ({finding.model}) answered: <strong>{STATUS_LABEL[finding.model_status]}</strong>
            </Step>
          )}
          {finding.provider !== "none" && (
          <Step part="code">
            {finding.evidence.length === 0
              ? "No quote to check."
              : `${finding.evidence.filter((e) => e.verified).length} of ${finding.evidence.length} quote(s) found in the document text.`}{" "}
            {modelDiffers ? (
              <>
                Result: <strong>{STATUS_LABEL[finding.ai_status]}</strong> (changed from the model&apos;s answer).
              </>
            ) : (
              "The model's answer was kept."
            )}
          </Step>
          )}
          {verifier !== "not_run" && (
            <Step part="verifier">
              {verifier === "supported" && "The quotes support the requirement."}
              {verifier === "not_supported" &&
                "The quotes do not show evidence for the requirement, so the result was lowered to Needs human review."}
              {verifier === "unavailable" && "No valid answer. It changed nothing."}
            </Step>
          )}
          <Step part="person">
            {finding.human_status ? (
              <>
                Your decision: <strong>{STATUS_LABEL[finding.human_status]}</strong>
              </>
            ) : (
              "Not decided yet."
            )}
          </Step>
        </ol>
        <p className="dev-ink mt-1">
          {finding.model} · prompt {finding.prompt_version}
        </p>
      </details>

      <DecisionDisclosure finding={finding} version={version} editing={editing} onEdit={() => setEditing(true)} />

      {showForm && (
        <div className="rounded-md border border-border p-3">
          <DecisionForm
            key={`${finding.id}-${version}`}
            finding={finding}
            user={user}
            contactEmail={contactEmail}
            reasons={reasons}
            onCancel={decided ? () => setEditing(false) : undefined}
            onSaved={(updated) => {
              onChanged(updated);
              setEditing(false);
              setVersion((v) => v + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}
