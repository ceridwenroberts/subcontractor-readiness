import type { ExpiringItem, OpenRequest } from "@/lib/schemas";

/**
 * How many things need follow-up. A requirement that is both close to expiry and has an open
 * request for a new upload is one thing to do, so it is counted once (as the request).
 */
export function issueCount(expiring: ExpiringItem[], requests: OpenRequest[]): number {
  const requested = new Set(requests.map((r) => `${r.engagement_id}:${r.requirement_code}`));
  const onlyExpiring = expiring.filter((e) => !requested.has(`${e.engagement_id}:${e.requirement_code}`));
  return requests.length + onlyExpiring.length;
}
