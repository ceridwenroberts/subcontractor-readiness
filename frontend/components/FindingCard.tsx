"use client";

import Link from "next/link";
import { useState } from "react";

import { Card, ErrorBox, StatusBadge, buttonClass, inputClass } from "@/components/ui";
import { decideFinding, listDecisions, viewerPath } from "@/lib/api";
import { DECISION_TEXT, STATUSES, STATUS_LABEL, WHO } from "@/lib/labels";
import { verifierOutcome } from "@/lib/provenance";
import type { Decision, Finding, Status, User } from "@/lib/schemas";
import { formatWhen } from "@/lib/time";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

function Tag({ part }: { part: keyof typeof WHO }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${WHO[part].color}`}>
      {WHO[part].tag}
    </span>
  );
}

function Step({
  part,
  children,
}: {
  part: keyof typeof WHO;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <Tag part={part} />
      <span>{children}</span>
    </li>
  );
}

export function FindingCard({
  finding,
  user,
  onChanged,
}: {
  finding: Finding;
  user: User | null;
  onChanged: (updated: Finding) => void;
}) {
  const [agree, setAgree] = useState(true);
  const [otherStatus, setOtherStatus] = useState<Status>(
    STATUSES.find((s) => s !== finding.ai_status) ?? "unclear",
  );
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Decision[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function loadHistory() {
    try {
      setHistory(await listDecisions(finding.id));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function onDecide(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // The person chooses the status: "confirm" sends the shown status, "change" the chosen one.
      const status = agree ? finding.ai_status : otherStatus;
      const updated = await decideFinding(finding.id, status, comment.trim());
      onChanged(updated);
      setComment("");
      if (showHistory) await loadHistory();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next) await loadHistory();
  }

  const verifier = verifierOutcome(finding);
  const modelDiffers = finding.model_status !== finding.ai_status;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-slate-600">{finding.requirement_code}</span>
          <span
            title={`${finding.model}, prompt ${finding.prompt_version}`}
            className="ml-2 rounded border border-slate-200 px-1 py-px text-[11px] text-slate-500"
          >
            {finding.provider_label}
          </span>
          <h3 className="font-medium">
            {finding.requirement_title}
            {!finding.mandatory && <span className="font-normal text-slate-600"> (optional)</span>}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={finding.ai_status} />
          {finding.human_status && <StatusBadge status={finding.human_status} prefix="Your decision" />}
        </div>
      </div>

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer select-none hover:text-slate-700">
          How this result was made{modelDiffers ? " · adjusted by automatic checks" : ""}
        </summary>
        <ol className="mt-2 space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
        <Step part="model">
          {finding.provider_label} ({finding.model}) answered:{" "}
          <strong>{STATUS_LABEL[finding.model_status]}</strong>
        </Step>
        <Step part="code">
          {finding.evidence.length === 0
            ? "No quote to check."
            : `${finding.evidence.filter((e) => e.verified).length} of ${finding.evidence.length} quote(s) found in the document text.`}{" "}
          {modelDiffers ? (
            <>
              Result: <strong>{STATUS_LABEL[finding.ai_status]}</strong> (changed from the model&apos;s
              answer).
            </>
          ) : (
            "The model's answer was kept."
          )}
        </Step>
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
        <p className="mt-1">
          {finding.model} · prompt {finding.prompt_version}
        </p>
      </details>

      <div className="mt-3 space-y-2">
        {finding.evidence.length === 0 && (
          <p className="text-sm text-slate-600">No quote is attached to this finding.</p>
        )}
        {finding.evidence.map((e, i) => (
          <figure key={i} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <blockquote className="whitespace-pre-wrap break-words">&ldquo;{e.quote}&rdquo;</blockquote>
            <figcaption className="mt-1 text-xs text-slate-600">
              {e.document_name}, page {e.page} ·{" "}
              <Link
                href={viewerPath(e.document_id, e.page, e.quote)}
                className="text-slate-900 underline underline-offset-2"
              >
                View in document
              </Link>{" "}
              ·{" "}
              {e.verified ? (
                <span className="text-emerald-800">quote found in the document text</span>
              ) : (
                <span className="text-rose-800">quote not found in the document text, so it is not used as evidence</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      {finding.valid_until && (
        <p className="mt-2 text-sm">Date shown in the documents: {finding.valid_until}</p>
      )}
      {finding.notes && <p className="mt-2 text-xs text-slate-500">{finding.notes}</p>}

      <form onSubmit={onDecide} className="mt-4 space-y-3 border-t border-slate-100 pt-3">
        <fieldset>
          <legend className="text-sm font-medium">
            {DECISION_TEXT.question}{" "}
            <span className="font-normal text-slate-600">
              Result so far: {STATUS_LABEL[finding.ai_status]}.
            </span>
          </legend>
          <div className="mt-2 space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={agree} onChange={() => setAgree(true)} />
              {DECISION_TEXT.confirm}
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" checked={!agree} onChange={() => setAgree(false)} />
              {DECISION_TEXT.change}:
              <select
                className={`${inputClass} w-auto`}
                value={otherStatus}
                disabled={agree}
                onChange={(e) => setOtherStatus(e.target.value as Status)}
                aria-label="Status you read from the documents"
              >
                {STATUSES.filter((s) => s !== finding.ai_status).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{DECISION_TEXT.reasonLabel}</span>
          <textarea
            className={inputClass}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            required
            placeholder={DECISION_TEXT.reasonPlaceholder}
          />
        </label>
        <button className={buttonClass} disabled={saving || !comment.trim() || !user}>
          {saving ? "Saving…" : "Record decision"}
        </button>
        <p className="text-xs text-slate-600">
          {user
            ? `Recording as ${user.name} (simulated sign-in).`
            : "Sign in at the top of the page to record a decision."}
        </p>
      </form>
      {error && (
        <div className="mt-2">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      <button type="button" onClick={toggleHistory} className="mt-2 text-xs text-slate-700 underline">
        {showHistory ? "Hide decision history" : "Show decision history"}
      </button>
      {showHistory && (
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {history === null && <li>Loading…</li>}
          {history?.length === 0 && <li>No decisions recorded yet.</li>}
          {history?.map((d) => (
            <li key={d.id} className="rounded border border-slate-200 bg-slate-50 p-2">
              {formatWhen(d.decided_at)} · {d.decided_by}:{" "}
              {d.old_human_status ? STATUS_LABEL[d.old_human_status] : "no earlier decision"} →{" "}
              <strong>{STATUS_LABEL[d.new_human_status]}</strong>
              <br />
              &ldquo;{d.comment}&rdquo;
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
