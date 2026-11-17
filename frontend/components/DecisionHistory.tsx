"use client";

import { useQueries } from "@tanstack/react-query";

import { listDecisions } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/labels";
import type { Finding } from "@/lib/schemas";
import { formatWhen, parseUtc } from "@/lib/time";

/** Every recorded decision on this subcontractor's findings, newest first. Read from the append-only log. */
export function DecisionHistory({ findings }: { findings: Finding[] }) {
  const results = useQueries({
    queries: findings.map((f) => ({
      // The status is part of the key so a new decision reloads the list.
      queryKey: ["decisions", f.id, f.human_status ?? ""],
      queryFn: () => listDecisions(f.id),
    })),
  });
  const loading = results.some((r) => r.isPending);
  const entries = results
    .flatMap((r, i) => (r.data ?? []).map((d) => ({ d, f: findings[i] })))
    .sort((a, b) => parseUtc(b.d.decided_at).getTime() - parseUtc(a.d.decided_at).getTime());

  if (loading && entries.length === 0) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>;
  return (
    <ol className="divide-y divide-border">
      {entries.map(({ d, f }) => (
        <li key={d.id} className="space-y-0.5 px-4 py-2.5 text-sm">
          <p className="text-xs text-muted-foreground">
            {formatWhen(d.decided_at)} · {d.decided_by}
          </p>
          <p>
            <span className="font-mono text-xs text-muted-foreground">{f.requirement_code}</span> {f.requirement_title}:{" "}
            {d.old_human_status ? STATUS_LABEL[d.old_human_status] : "No earlier decision"} →{" "}
            <strong>{STATUS_LABEL[d.new_human_status]}</strong>
          </p>
          {d.reason_label && <p className="text-xs">Reason: {d.reason_label}</p>}
          {d.comment && <p className="text-xs text-muted-foreground">&ldquo;{d.comment}&rdquo;</p>}
        </li>
      ))}
    </ol>
  );
}
