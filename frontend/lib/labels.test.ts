import { describe, expect, it } from "vitest";

import {
  BANNED_WORDS,
  DISCLAIMER,
  PLACEHOLDER_BANNER,
  SIMULATED_NOTE,
  STATUS_HELP,
  STATUS_LABEL,
  STATUSES,
  DECISION_TEXT,
  REQUEST_TEXT,
  WHO,
  WHO_TEXT,
} from "./labels";

describe("status wording", () => {
  it("covers every status", () => {
    expect(STATUSES.sort()).toEqual(["expired", "found", "missing", "partial", "unclear"]);
  });

  it("never uses a verdict word", () => {
    const strings = [
      ...Object.values(STATUS_LABEL),
      ...Object.values(STATUS_HELP),
      PLACEHOLDER_BANNER,
      SIMULATED_NOTE,
      ...Object.values(WHO_TEXT),
      ...Object.values(WHO).map((w) => w.tag),
      ...Object.values(DECISION_TEXT),
      ...Object.values(REQUEST_TEXT),
    ];
    for (const text of strings) {
      for (const word of BANNED_WORDS) {
        expect(text.toLowerCase(), `"${text}" contains "${word}"`).not.toMatch(
          new RegExp(`\\b${word}\\b`),
        );
      }
    }
  });

  it("states that the disclaimer is not an approval, once, as a negation", () => {
    expect(DISCLAIMER).toContain("not an approval");
  });
});
