import { describe, expect, it } from "vitest";

import { parseUtc } from "./time";

describe("parseUtc", () => {
  it("reads a zone-less timestamp as UTC", () => {
    expect(parseUtc("2026-11-16T14:54:26.849475").toISOString()).toBe("2026-11-16T14:54:26.849Z");
  });
  it("leaves timestamps that already have a zone alone", () => {
    expect(parseUtc("2026-11-16T14:54:26Z").toISOString()).toBe("2026-11-16T14:54:26.000Z");
    expect(parseUtc("2026-11-16T16:54:26+02:00").toISOString()).toBe("2026-11-16T14:54:26.000Z");
  });
});
