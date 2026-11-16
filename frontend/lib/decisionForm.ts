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
 * - Confirming the shown result needs no comment. Changing the result, or asking for a new
 *   upload, needs one.
 * - A new upload can only be requested when the recorded status is not "found".
 * - A request needs a reason. An email is only sent (simulated) when a contact address exists.
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
  | "comment_required"
  | "reason_required";

export type DecisionState = {
  chosen: Status | ""; // the status that would be recorded
  canRequest: boolean; // the "ask for a new upload" section may be shown
  requesting: boolean; // a new upload will be requested
  needsComment: boolean; // the comment is required
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
  const needsComment = i.agree === false || requesting;

  let blockedBecause: BlockedBecause | null = null;
  if (i.saving) blockedBecause = "saving";
  else if (!i.hasUser) blockedBecause = "sign_in";
  else if (i.agree === null) blockedBecause = "choose_option";
  else if (chosen === "") blockedBecause = "choose_status";
  else if (needsComment && !i.comment.trim()) blockedBecause = "comment_required";
  else if (requesting && !i.reason) blockedBecause = "reason_required";

  return {
    chosen,
    canRequest,
    requesting,
    needsComment,
    blocked: blockedBecause !== null,
    blockedBecause,
  };
}

export type DecisionPayload = {
  status: Status;
  comment: string;
  requestUpload?: { reason: string; sendEmail: boolean };
};

/** What to send to the backend, or null if the form cannot be submitted yet. */
export function buildDecision(i: DecisionInput): DecisionPayload | null {
  const state = evaluateDecision({ ...i, saving: false });
  if (state.blocked || state.chosen === "") return null;
  return {
    status: state.chosen,
    comment: i.comment.trim(),
    ...(state.requesting
      ? { requestUpload: { reason: i.reason, sendEmail: i.sendEmail && i.hasContactEmail } }
      : {}),
  };
}
