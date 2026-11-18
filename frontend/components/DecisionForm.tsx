"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox, RadioGroup, RadioItem } from "@/components/ui/checkbox";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { ErrorBox } from "@/components/Banners";
import { decideFinding } from "@/lib/api";
import { buildDecision, evaluateDecision, initialAgree, type BlockedBecause } from "@/lib/decisionForm";
import { DECISION_TEXT, REQUEST_TEXT, STATUSES, STATUS_LABEL } from "@/lib/labels";
import type { Finding, Reason, Status, User } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

const BLOCKED_TEXT: Record<BlockedBecause, string> = {
  saving: "Saving…",
  sign_in: "Sign in at the bottom of the left menu to record a decision.",
  choose_option: "Choose one of the options above.",
  choose_status: "Choose the status you read from the documents.",
  reason_required: "Choose a reason.",
  comment_required: "Describe the reason in your own words, because you chose Other.",
};

/**
 * The decision form. Every rule (what is required, what is sent) comes from lib/decisionForm.ts;
 * this component only draws it and calls the API.
 */
export function DecisionForm({
  finding,
  user,
  contactEmail,
  reasons,
  onSaved,
  onCancel,
}: {
  finding: Finding;
  user: User | null;
  contactEmail: string | null;
  reasons: Reason[];
  onSaved: (updated: Finding) => void;
  onCancel?: () => void;
}) {
  // No document uploaded: there is no result to agree with, only a new upload to ask for.
  const noDocument = finding.provider === "none";
  const [agree, setAgree] = useState<boolean | null>(() => (noDocument ? true : initialAgree(finding.ai_status)));
  const [otherStatus, setOtherStatus] = useState<Status | "">("");
  const [wantRequest, setWantRequest] = useState(noDocument);
  const [reason, setReason] = useState(noDocument ? "not_uploaded" : "");
  const [sendEmail, setSendEmail] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = {
    aiStatus: finding.ai_status,
    agree,
    otherStatus,
    wantRequest,
    reason,
    sendEmail,
    comment,
    hasUser: !!user,
    hasContactEmail: !!contactEmail,
    saving,
  };
  const { canRequest, requesting, needsReason, needsComment, blocked, blockedBecause } = evaluateDecision(input);
  const id = `decision-${finding.id}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const decision = buildDecision(input);
    if (!decision || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await decideFinding(finding.id, decision);
      const asked = decision.requestUpload
        ? ` ${REQUEST_TEXT.recorded}${decision.requestUpload.sendEmail ? ` ${REQUEST_TEXT.recordedEmail}` : ""}`
        : "";
      toast(`Decision recorded: ${STATUS_LABEL[decision.status]}.${asked}`);
      onSaved(updated);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {noDocument ? "Ask the subcontractor for this document?" : DECISION_TEXT.question}{" "}
          <span className="font-normal text-muted-foreground">
            Result so far: {noDocument ? "No document uploaded" : STATUS_LABEL[finding.ai_status]}.
          </span>
        </legend>
        {!noDocument && (
        <RadioGroup
          value={agree === null ? "" : agree ? "yes" : "no"}
          onValueChange={(v) => setAgree(v === "yes")}
          aria-label={DECISION_TEXT.question}
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioItem value="yes" id={`${id}-yes`} />
            {DECISION_TEXT.confirm}
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <RadioItem value="no" id={`${id}-no`} />
              {DECISION_TEXT.change}:
            </label>
            <NativeSelect
              className="w-auto"
              value={otherStatus}
              onChange={(e) => setOtherStatus(e.target.value as Status)}
              aria-label="Status you read from the documents"
              disabled={agree !== false}
            >
              <option value="" disabled>
                Choose a status…
              </option>
              {STATUSES.filter((s) => s !== finding.ai_status).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </RadioGroup>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-reason`} className="text-xs font-medium">
          {REQUEST_TEXT.reasonLabel}{" "}
          <span className="font-normal text-muted-foreground">
            {needsReason ? REQUEST_TEXT.reasonRequired : REQUEST_TEXT.reasonOptional}
          </span>
        </label>
        <NativeSelect
          id={`${id}-reason`}
          className="w-auto max-w-full"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">{REQUEST_TEXT.reasonPlaceholder}</option>
          {reasons.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {canRequest && (
        <div className="space-y-2 border-t border-border pt-3 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <Checkbox checked={wantRequest} onCheckedChange={(v) => setWantRequest(v === true)} />
            {REQUEST_TEXT.checkbox}
          </label>
          {requesting && (
            <label className="flex items-start gap-2">
              <Checkbox
                className="mt-0.5"
                checked={sendEmail && !!contactEmail}
                disabled={!contactEmail}
                onCheckedChange={(v) => setSendEmail(v === true)}
              />
              <span>
                {REQUEST_TEXT.emailLabel}
                {contactEmail ? ` (${contactEmail})` : ""}
                <span className="block text-xs text-muted-foreground">
                  {contactEmail ? REQUEST_TEXT.emailSimulated : REQUEST_TEXT.noContact}
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-note`} className="text-xs font-medium">
          {needsComment ? REQUEST_TEXT.commentRequired : REQUEST_TEXT.commentOptional}
        </label>
        <Textarea
          id={`${id}-note`}
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          aria-required={needsComment || undefined}
          placeholder={DECISION_TEXT.reasonPlaceholder}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          loading={saving}
          loadingText="Saving…"
          unavailable={blocked && !saving}
          unavailableReason={blockedBecause ? BLOCKED_TEXT[blockedBecause] : undefined}
        >
          Record decision
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {blocked && !saving && blockedBecause
            ? BLOCKED_TEXT[blockedBecause]
            : user
              ? `Recording as ${user.name} (simulated sign-in).`
              : ""}
        </p>
      </div>
      {agree === null && (
        <p className="text-xs text-muted-foreground">
          Nothing is selected for you, because the documents did not clearly show evidence.
        </p>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </form>
  );
}
