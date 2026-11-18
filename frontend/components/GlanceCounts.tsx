import { GLANCE_LABEL } from "@/lib/labels";
import type { Glance } from "@/lib/schemas";

const ORDER: Glance[] = [
  "new_upload_requested",
  "awaiting_decision",
  "documents_missing",
  "gaps_recorded",
  "documentation_complete",
  "not_assessed",
];

/** How many subcontractors are in each review state. Plain counts, no total and no ratio. */
export function GlanceCounts({ counts }: { counts: Partial<Record<Glance, number>> | null }) {
  if (counts === null) return <span className="text-muted-foreground">…</span>;
  const parts = ORDER.filter((g) => counts[g]);
  if (parts.length === 0) return <span className="text-xs text-muted-foreground">No subcontractors yet</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {parts.map((g) => (
        <li key={g}>
          <span className="font-medium">{counts[g]}</span> {GLANCE_LABEL[g].toLowerCase()}
        </li>
      ))}
    </ul>
  );
}
