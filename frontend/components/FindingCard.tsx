"use client";

import { useState } from "react";

import { Card, ErrorBox, StatusBadge, buttonClass, inputClass } from "@/components/ui";
import { decideFinding, listDecisions } from "@/lib/api";
import { SIMULATED_NOTE, STATUSES, STATUS_LABEL } from "@/lib/labels";
import type { Decision, Finding, Status } from "@/lib/schemas";
import { formatWhen } from "@/lib/time";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export function FindingCard({
  finding,
  reviewer,
  onChanged,
}: {
  finding: Finding;
  reviewer: string;
  onChanged: (updated: Finding) => void;
}) {
  const [status, setStatus] = useState<Status>(finding.human_status ?? finding.ai_status);
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
      const updated = await decideFinding(finding.id, status, comment.trim(), reviewer.trim());
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

  const modelDiffers = finding.model_status !== finding.ai_status;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-slate-600">{finding.requirement_code}</span>
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

      {modelDiffers && (
        <p className="mt-2 text-xs text-slate-600">
          The model answered &ldquo;{STATUS_LABEL[finding.model_status]}&rdquo;. The code checks
          changed this because the evidence did not support it.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {finding.evidence.length === 0 && (
          <p className="text-sm text-slate-600">No quote is attached to this finding.</p>
        )}
        {finding.evidence.map((e, i) => (
          <figure key={i} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <blockquote className="whitespace-pre-wrap break-words">&ldquo;{e.quote}&rdquo;</blockquote>
            <figcaption className="mt-1 text-xs text-slate-600">
              {e.document_name}, page {e.page} ·{" "}
              {e.verified ? (
                <span className="text-emerald-800">quote verified in the document text</span>
              ) : (
                <span className="text-rose-800">quote could not be verified, so it is not used as evidence</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      {finding.valid_until && (
        <p className="mt-2 text-sm">Date shown in the documents: {finding.valid_until}</p>
      )}
      {finding.notes && <p className="mt-2 text-sm text-slate-700">{finding.notes}</p>}

      <p className="mt-3 text-xs text-slate-600">
        <span className="mr-2 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-medium">
          {finding.provider_label}
        </span>
        {finding.model} · prompt {finding.prompt_version}
        {finding.provider === "scripted" && <span className="block pt-1">{SIMULATED_NOTE}</span>}
      </p>

      <form onSubmit={onDecide} className="mt-4 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your decision</span>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Comment (required)</span>
          <input
            className={inputClass}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            required
            placeholder="Why do you agree or disagree?"
          />
        </label>
        <button className={buttonClass} disabled={saving || !comment.trim() || !reviewer.trim()}>
          {saving ? "Saving…" : "Record decision"}
        </button>
      </form>
      {!reviewer.trim() && (
        <p className="mt-1 text-xs text-slate-600">Enter your name above the list to record a decision.</p>
      )}
      {error && (
        <div className="mt-2">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      <button type="button" onClick={toggleHistory} className="mt-3 text-xs text-slate-700 underline">
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
