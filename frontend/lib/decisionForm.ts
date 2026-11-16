/**
 * The rules of the decision form, kept out of the React component on purpose.
 *
 * A restyle of the screen may move, rename or re-skin the controls, but it must not change
 * these rules. They are covered by `decisionForm.test.ts`; if a redesign breaks one, the
 * redesign is wrong, not the test. See docs/ui-handoff.md.
 *
 * Rules:
 * - Only a result that shows evidence ("found") is pre-selected as "agree". Anything else
 *   makes the reviewer choose on purpose.
 * - A reason from the list is optional when confirming the shown result. It is required when
 *   changing the result or asking for a new upload (which is never required).
 * - Typed text is required only when the reason is "other".
 * - A new upload can only be requested when the recorded status is not "found".
 * - An email is only sent (simulated) when a contact address exists.
 * - Recording needs a signed-in (simulated) user. The name is set by the server, never here.
 */
import type { Status } from "./schemas";

export type DecisionInput = {
  aiStatus: Status; // the result after automatic checks, as shown to the reviewer
  agree: boolean | null; // true = confirm the shown result, false = read it differently, null = not chosen
  otherStatus: Status | ""; // the status chosen when agree is false
  wantRequest: boolean; // "ask the subcontractor for a new upload" ticked
  reason: string; // key of the chosen reason, or "" if none
  sendEmail: boolean; // "also send the request by email" ticked (simulated)
  comment: string;
  hasUser: boolean; // someone is signed in
  hasContactEmail: boolean; // the subcontractor has a contact address
  saving: boolean; // a save is in progress
};

export type BlockedBecause =
  | "saving"
  | "sign_in"
  | "choose_option"
  | "choose_status"
  | "reason_required"
  | "comment_required";

export type DecisionState = {
  chosen: Status | ""; // the status that would be recorded
  canRequest: boolean; // the "ask for a new upload" section may be shown
  requesting: boolean; // a new upload will be requested
  needsReason: boolean; // a reason from the list is required
  needsComment: boolean; // typed text is required (reason is "other")
  blocked: boolean; // "Record decision" must be disabled
  blockedBecause: BlockedBecause | null; // first thing missing, for a hint in the UI
};

/** What is selected when the finding is first shown. */
export function initialAgree(aiStatus: Status): boolean | null {
  return aiStatus === "found" ? true : null;
}

export function evaluateDecision(i: DecisionInput): DecisionState {
  const chosen: Status | "" = i.agree === true ? i.aiStatus : i.agree === false ? i.otherStatus : "";
  const canRequest = chosen !== "" && chosen !== "found";
  const requesting = i.wantRequest && canRequest;
  const needsReason = i.agree === false || requesting;
  const needsComment = i.reason === "other";

  let blockedBecause: BlockedBecause | null = null;
  if (i.saving) blockedBecause = "saving";
  else if (!i.hasUser) blockedBecause = "sign_in";
  else if (i.agree === null) blockedBecause = "choose_option";
  else if (chosen === "") blockedBecause = "choose_status";
  else if (needsReason && !i.reason) blockedBecause = "reason_required";
  else if (needsComment && !i.comment.trim()) blockedBecause = "comment_required";

  return {
    chosen,
    canRequest,
    requesting,
    needsReason,
    needsComment,
    blocked: blockedBecause !== null,
    blockedBecause,
  };
}

export type DecisionPayload = {
  status: Status;
  comment: string;
  reason?: string; // key from the reasons list; the server stores it in the decision log
  requestUpload?: { sendEmail: boolean }; // the reason above is the reason for the request
};

/** What to send to the backend, or null if the form cannot be submitted yet. */
export function buildDecision(i: DecisionInput): DecisionPayload | null {
  const state = evaluateDecision({ ...i, saving: false });
  if (state.blocked || state.chosen === "") return null;
  return {
    status: state.chosen,
    comment: i.comment.trim(),
    ...(i.reason ? { reason: i.reason } : {}),
    ...(state.requesting ? { requestUpload: { sendEmail: i.sendEmail && i.hasContactEmail } } : {}),
  };
}
