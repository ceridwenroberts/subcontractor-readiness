import { describe, expect, it } from "vitest";

import { findQuoteRange, splitAround } from "./highlight";

const PAGE = "Intyg om F-skatt\n\nExempelrör AB är godkänd för F-skatt.\nUtfärdat av Skatteverket.";

function found(page: string, quote: string): string | null {
  const range = findQuoteRange(page, quote);
  return range ? page.slice(range[0], range[1]) : null;
}

describe("findQuoteRange", () => {
  it("finds an exact quote and returns the original text", () => {
    expect(found(PAGE, "Exempelrör AB är godkänd för F-skatt.")).toBe(
      "Exempelrör AB är godkänd för F-skatt.",
    );
  });
  it("ignores case and extra spacing", () => {
    expect(found(PAGE, "EXEMPELRÖR   AB är godkänd")).toBe("Exempelrör AB är godkänd");
  });
  it("matches across a line break", () => {
    expect(found(PAGE, "godkänd för F-skatt. Utfärdat av Skatteverket")).toBe(
      "godkänd för F-skatt.\nUtfärdat av Skatteverket",
    );
  });
  it("joins a hyphen at the end of a line, like the backend", () => {
    const page = "Bolaget har ansvarsför-\nsäkring som gäller.";
    expect(found(page, "ansvarsförsäkring som gäller")).toBe("ansvarsför-\nsäkring som gäller");
  });
  it("keeps a hyphen inside a word on one line", () => {
    expect(found(PAGE, "är godkänd för F-skatt")).toBe("är godkänd för F-skatt");
  });
  it("returns null for text that is not on the page", () => {
    expect(found(PAGE, "bolaget har tecknat ansvarsförsäkring")).toBeNull();
    expect(found(PAGE, "")).toBeNull();
    expect(found(PAGE, "   ")).toBeNull();
  });
  it("handles Swedish letters", () => {
    expect(found("Säker Vatten ÅÄÖ åäö", "säker vatten åäö åäö")).toBe("Säker Vatten ÅÄÖ åäö");
  });
});

describe("splitAround", () => {
  it("splits the page into before, match, after", () => {
    const range = findQuoteRange(PAGE, "är godkänd för F-skatt");
    const parts = splitAround(PAGE, range);
    expect(parts.match).toBe("är godkänd för F-skatt");
    expect(parts.before + parts.match + parts.after).toBe(PAGE);
  });
  it("returns the whole page as 'before' when there is no range", () => {
    expect(splitAround("abc", null)).toEqual({ before: "abc", match: "", after: "" });
  });
});
