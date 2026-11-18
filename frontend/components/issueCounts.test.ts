import { describe, expect, it } from "vitest";

import { issueCount } from "./issueCounts";
import type { ExpiringItem, OpenRequest } from "../lib/schemas";

const exp = (engagement_id: string, requirement_code: string) => ({ engagement_id, requirement_code }) as ExpiringItem;
const req = (engagement_id: string, requirement_code: string) => ({ engagement_id, requirement_code }) as OpenRequest;

describe("issueCount", () => {
  it("counts a requirement with both an expiring date and an open request once", () => {
    expect(issueCount([exp("e1", "A"), exp("e1", "B")], [req("e1", "A")])).toBe(2);
  });
  it("counts separate items separately", () => {
    expect(issueCount([exp("e1", "A")], [req("e2", "A")])).toBe(2);
    expect(issueCount([], [])).toBe(0);
  });
});
