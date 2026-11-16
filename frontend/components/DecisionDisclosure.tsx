"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/components/cn";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { listDecisions } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/labels";
import type { Decision, Finding } from "@/lib/schemas";
import { formatWhen } from "@/lib/time";

/**
 * Always visible, also when the form is hidden: the decision on this finding and its history.
 * The history is the append-only log, newest first. `version` changes when a decision is saved,
 * which reloads it.
 */
export function DecisionDisclosure({
  finding,
  version,
  onEdit,
  editing,
}: {
  finding: Finding;
  version: number;
  onEdit: () => void;
  editing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Decision[] | null>(null);
  const [loadProblem, setLoadProblem] = useState(false);

  useEffect(() => {
    let ignore = false;
    listDecisions(finding.id)
      .then((d) => {
        if (!ignore) {
          setHistory([...d].reverse());
          setLoadProblem(false);
        }
      })
      .catch(() => {
        if (!ignore) setLoadProblem(true);
      });
    return () => {
      ignore = true;
    };
  }, [finding.id, version]);

  const latest = history?.[0];
  const decided = !!finding.human_status;
  const panelId = `history-${finding.id}`;

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left text-sm hover:text-muted-foreground"
        >
          <ChevronRight className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")} aria-hidden />
          <span className="font-medium">Decision</span>
          {decided && finding.human_status ? (
            <StatusBadge status={finding.human_status} prefix="Your decision" />
          ) : (
            <span className="text-muted-foreground">Not decided yet</span>
          )}
          {latest && (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {latest.decided_by} · {formatWhen(latest.decided_at)}
            </span>
          )}
        </button>
        {decided && !editing && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit decision
          </Button>
        )}
      </div>
      {open && (
        <div id={panelId} className="border-t border-border px-3 py-2 text-xs">
          {loadProblem && <p>The history could not be loaded.</p>}
          {!loadProblem && history === null && <p className="text-muted-foreground">Loading…</p>}
          {history?.length === 0 && <p className="text-muted-foreground">No decisions recorded yet.</p>}
          <ol className="divide-y divide-border">
            {history?.map((d, i) => (
              <li key={d.id} className="py-1.5 first:pt-0 last:pb-0">
                <p>
                  <span className="text-muted-foreground">
                    {formatWhen(d.decided_at)} · {d.decided_by}
                    {i === 0 ? " · current" : ""}
                  </span>
                </p>
                <p>
                  {d.old_human_status ? STATUS_LABEL[d.old_human_status] : "No earlier decision"} →{" "}
                  <strong>{STATUS_LABEL[d.new_human_status]}</strong>
                </p>
                {d.reason_label && <p>Reason: {d.reason_label}</p>}
                {d.comment && <p className="text-muted-foreground">&ldquo;{d.comment}&rdquo;</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
