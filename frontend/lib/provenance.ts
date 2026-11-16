import type { Finding } from "./schemas";

export type VerifierOutcome = "not_run" | "supported" | "not_supported" | "unavailable";

/**
 * What the second check (verifier agent) did for a finding. The backend does not store this
 * as a field: it marks the prompt version "...+verify-v1" when the verifier ran, and adds a
 * note when it downgraded the finding or could not answer. A dedicated field would be cleaner
 * (data model change, not made yet), so these phrases are covered by a test.
 */
export function verifierOutcome(f: Pick<Finding, "prompt_version" | "notes">): VerifierOutcome {
  if (!f.prompt_version.includes("+verify")) return "not_run";
  if (f.notes.includes("A second check found that the quotes do not")) return "not_supported";
  if (f.notes.includes("The second check could not give a valid answer")) return "unavailable";
  return "supported";
}

export function usedVerifier(findings: Pick<Finding, "prompt_version">[]): boolean {
  return findings.some((f) => f.prompt_version.includes("+verify"));
}
