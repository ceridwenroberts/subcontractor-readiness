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

describe("reason and text rules", () => {
  it("confirming the shown result needs no reason and no text", () => {
    const s = evaluateDecision(form({ agree: true, reason: "", comment: "" }));
    expect(s.needsReason).toBe(false);
    expect(s.needsComment).toBe(false);
    expect(s.blocked).toBe(false);
  });
  it("a reason may be given when confirming, and it is optional", () => {
    expect(evaluateDecision(form({ agree: true, reason: "incomplete" })).blocked).toBe(false);
  });
  it("changing the result needs a reason from the list, but no text", () => {
    const base2 = { agree: false, otherStatus: "partial" as const };
    const s = evaluateDecision(form(base2));
    expect(s.needsReason).toBe(true);
    expect(s.blockedBecause).toBe("reason_required");
    expect(evaluateDecision(form({ ...base2, reason: "incomplete" })).blocked).toBe(false);
  });
  it("typed text is required only when the reason is other", () => {
    const base2 = { agree: false, otherStatus: "partial" as const, reason: "other" };
    expect(evaluateDecision(form(base2)).blockedBecause).toBe("comment_required");
    expect(evaluateDecision(form({ ...base2, comment: "   " })).blockedBecause).toBe("comment_required");
    expect(evaluateDecision(form({ ...base2, comment: "Seen in the annex." })).blocked).toBe(false);
    // Any other reason: text stays optional.
    for (const reason of ["expired", "wrong_document", "unreadable", "incomplete"]) {
      expect(evaluateDecision(form({ ...base2, reason })).needsComment, reason).toBe(false);
    }
  });
  it("other needs text even when confirming without a request", () => {
    expect(evaluateDecision(form({ agree: true, reason: "other" })).blockedBecause).toBe("comment_required");
  });
  it("changing the result needs a status to be chosen first", () => {
    const s = evaluateDecision(form({ agree: false, otherStatus: "", reason: "incomplete" }));
    expect(s.blockedBecause).toBe("choose_status");
  });
});

describe("requesting a new upload", () => {
  it("is never required", () => {
    expect(evaluateDecision(form({ aiStatus: "expired", agree: true })).blocked).toBe(false);
  });
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
  it("needs a reason from the list, but no text unless it is other", () => {
    const base2 = { aiStatus: "expired" as const, wantRequest: true };
    expect(evaluateDecision(form(base2)).blockedBecause).toBe("reason_required");
    expect(evaluateDecision(form({ ...base2, reason: "expired" })).blocked).toBe(false);
    expect(evaluateDecision(form({ ...base2, reason: "other" })).blockedBecause).toBe("comment_required");
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
  it("confirms with an empty comment, no reason and no request", () => {
    expect(buildDecision(form())).toEqual({ status: "found", comment: "" });
  });
  it("sends the reason, a trimmed comment, and the request", () => {
    expect(
      buildDecision(
        form({ aiStatus: "expired", wantRequest: true, reason: "expired", sendEmail: true, comment: "  Renew it.  " }),
      ),
    ).toEqual({
      status: "expired",
      comment: "Renew it.",
      reason: "expired",
      requestUpload: { sendEmail: true },
    });
  });
  it("sends a reason without a request when none was asked for", () => {
    expect(
      buildDecision(form({ aiStatus: "unclear", agree: false, otherStatus: "missing", reason: "incomplete" })),
    ).toEqual({ status: "missing", comment: "", reason: "incomplete" });
  });
  it("never sends the email option without a contact address", () => {
    const p = buildDecision(
      form({ aiStatus: "expired", wantRequest: true, reason: "other", sendEmail: true, comment: "x", hasContactEmail: false }),
    );
    expect(p?.requestUpload).toEqual({ sendEmail: false });
  });
  it("sends nothing when the form is not ready", () => {
    expect(buildDecision(form({ aiStatus: "missing", agree: null }))).toBeNull();
    expect(buildDecision(form({ hasUser: false }))).toBeNull();
    expect(buildDecision(form({ aiStatus: "unclear", agree: false, otherStatus: "missing" }))).toBeNull();
  });
  it("never includes a name: the server decides who is signed in", () => {
    const p = buildDecision(form()) as Record<string, unknown>;
    expect(Object.keys(p)).not.toContain("decidedBy");
    expect(Object.keys(p)).not.toContain("decided_by");
  });
});
