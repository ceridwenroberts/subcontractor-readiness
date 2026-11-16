import { describe, expect, it } from "vitest";

import { buildDecision, evaluateDecision, initialAgree, type DecisionInput } from "./decisionForm";

const base: DecisionInput = {
  aiStatus: "found",
  agree: true,
  otherStatus: "",
  wantRequest: false,
  reason: "",
  sendEmail: false,
  comment: "",
  hasUser: true,
  hasContactEmail: true,
  saving: false,
};
const form = (over: Partial<DecisionInput> = {}): DecisionInput => ({ ...base, ...over });

describe("pre-selection", () => {
  it("pre-selects agree only for a result that shows evidence", () => {
    expect(initialAgree("found")).toBe(true);
    for (const s of ["partial", "missing", "unclear", "expired"] as const) {
      expect(initialAgree(s), s).toBeNull();
    }
  });
  it("blocks recording until a choice is made", () => {
    const s = evaluateDecision(form({ aiStatus: "missing", agree: null }));
    expect(s.blocked).toBe(true);
    expect(s.blockedBecause).toBe("choose_option");
  });
});

describe("comment rule", () => {
  it("confirming the shown result needs no comment", () => {
    const s = evaluateDecision(form({ agree: true, comment: "" }));
    expect(s.needsComment).toBe(false);
    expect(s.blocked).toBe(false);
  });
  it("changing the result needs a comment", () => {
    const s = evaluateDecision(form({ agree: false, otherStatus: "partial", comment: "   " }));
    expect(s.needsComment).toBe(true);
    expect(s.blockedBecause).toBe("comment_required");
    expect(evaluateDecision(form({ agree: false, otherStatus: "partial", comment: "Half shown." })).blocked).toBe(false);
  });
  it("asking for a new upload needs a comment even when confirming", () => {
    const s = evaluateDecision(form({ aiStatus: "expired", agree: true, wantRequest: true, reason: "expired" }));
    expect(s.needsComment).toBe(true);
    expect(s.blockedBecause).toBe("comment_required");
  });
  it("changing the result needs a status to be chosen first", () => {
    const s = evaluateDecision(form({ agree: false, otherStatus: "", comment: "x" }));
    expect(s.blockedBecause).toBe("choose_status");
  });
});

describe("requesting a new upload", () => {
  it("is not offered when the recorded status is found", () => {
    expect(evaluateDecision(form({ agree: true })).canRequest).toBe(false);
    expect(evaluateDecision(form({ aiStatus: "missing", agree: false, otherStatus: "found" })).canRequest).toBe(false);
  });
  it("is offered for every status that is not found", () => {
    for (const s of ["partial", "missing", "unclear", "expired"] as const) {
      expect(evaluateDecision(form({ aiStatus: s, agree: true })).canRequest, s).toBe(true);
    }
  });
  it("a ticked box is ignored when it cannot apply", () => {
    const s = evaluateDecision(form({ agree: true, wantRequest: true }));
    expect(s.requesting).toBe(false);
    expect(s.blocked).toBe(false);
  });
  it("needs a reason", () => {
    const s = evaluateDecision(form({ aiStatus: "expired", wantRequest: true, comment: "Renew it." }));
    expect(s.blockedBecause).toBe("reason_required");
    expect(evaluateDecision(form({ aiStatus: "expired", wantRequest: true, comment: "Renew it.", reason: "expired" })).blocked).toBe(false);
  });
});

describe("who and when", () => {
  it("needs a signed-in user", () => {
    expect(evaluateDecision(form({ hasUser: false })).blockedBecause).toBe("sign_in");
  });
  it("is blocked while saving", () => {
    expect(evaluateDecision(form({ saving: true })).blockedBecause).toBe("saving");
  });
});

describe("what is sent", () => {
  it("confirms with an empty comment and no request", () => {
    expect(buildDecision(form())).toEqual({ status: "found", comment: "" });
  });
  it("sends the chosen status, a trimmed comment, and the request", () => {
    expect(
      buildDecision(
        form({ aiStatus: "expired", wantRequest: true, reason: "expired", sendEmail: true, comment: "  Renew it.  " }),
      ),
    ).toEqual({
      status: "expired",
      comment: "Renew it.",
      requestUpload: { reason: "expired", sendEmail: true },
    });
  });
  it("never sends the email option without a contact address", () => {
    const p = buildDecision(
      form({ aiStatus: "expired", wantRequest: true, reason: "other", sendEmail: true, comment: "x", hasContactEmail: false }),
    );
    expect(p?.requestUpload).toEqual({ reason: "other", sendEmail: false });
  });
  it("sends the status the reviewer chose when changing the result", () => {
    expect(buildDecision(form({ aiStatus: "unclear", agree: false, otherStatus: "missing", comment: "Not in the packet." }))).toEqual({
      status: "missing",
      comment: "Not in the packet.",
    });
  });
  it("sends nothing when the form is not ready", () => {
    expect(buildDecision(form({ aiStatus: "missing", agree: null }))).toBeNull();
    expect(buildDecision(form({ hasUser: false }))).toBeNull();
  });
  it("never includes a name: the server decides who is signed in", () => {
    const p = buildDecision(form()) as Record<string, unknown>;
    expect(Object.keys(p)).not.toContain("decidedBy");
    expect(Object.keys(p)).not.toContain("decided_by");
  });
});
