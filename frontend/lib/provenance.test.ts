import { describe, expect, it } from "vitest";

import { usedVerifier, verifierOutcome } from "./provenance";

describe("verifierOutcome", () => {
  it("is not_run when the prompt version has no verifier part", () => {
    expect(verifierOutcome({ prompt_version: "assess-v2", notes: "" })).toBe("not_run");
  });
  it("is supported when it ran and left no note", () => {
    expect(verifierOutcome({ prompt_version: "assess-v2+verify-v1", notes: "" })).toBe("supported");
  });
  it("is not_supported when the backend's downgrade note is present", () => {
    const notes =
      'A second check found that the quotes do not show evidence for this requirement. It said: "x"';
    expect(verifierOutcome({ prompt_version: "assess-v2+verify-v1", notes })).toBe("not_supported");
  });
  it("is unavailable when the verifier could not answer", () => {
    const notes = "The second check could not give a valid answer, so it changed nothing.";
    expect(verifierOutcome({ prompt_version: "assess-v2+verify-v1", notes })).toBe("unavailable");
  });
});

describe("usedVerifier", () => {
  it("is true if any finding ran it", () => {
    expect(usedVerifier([{ prompt_version: "assess-v2" }, { prompt_version: "assess-v2+verify-v1" }])).toBe(true);
    expect(usedVerifier([{ prompt_version: "assess-v2" }])).toBe(false);
    expect(usedVerifier([])).toBe(false);
  });
});
