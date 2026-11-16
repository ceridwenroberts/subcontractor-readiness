import { describe, expect, it } from "vitest";

import { getThemeChoice, parseTheme, resolveTheme } from "./theme";

describe("parseTheme", () => {
  it("accepts the three choices", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
  });
  it("falls back to system for anything else", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("blue")).toBe("system");
    expect(parseTheme(3)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the system setting only when the choice is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("lets an explicit choice win over the system setting", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("getThemeChoice", () => {
  it("returns system when there is no browser storage", () => {
    expect(getThemeChoice()).toBe("system");
  });
});
