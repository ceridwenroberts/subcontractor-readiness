import { Check } from "lucide-react";
import Link from "next/link";

import { GlanceBadge } from "@/components/GlanceBadge";
import { StatusIcon } from "@/components/StatusBadge";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_LABEL, STATUS_SHORT } from "@/lib/labels";
import type { Overview } from "@/lib/schemas";

/**
 * Subcontractors against requirements. Each cell shows the status, and a tick when a person
 * has decided it. Plain counts only: no totals, no scores.
 */
export function OverviewGrid({ overview }: { overview: Overview }) {
  const rows = overview.engagements;
  if (rows.length === 0) return <p className="px-4 py-6 text-sm text-muted-foreground">No subcontractors yet.</p>;
  const columns = rows[0].requirements;
  return (
    <Table className="min-w-[40rem]">
      <THead>
        <Tr>
          <Th>Subcontractor</Th>
          {columns.map((c) => (
            <Th key={c.code} className="text-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="font-mono">
                    {c.code.replace(/^[A-Z]+-/, "")}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {c.code} {c.title}
                  {c.mandatory ? "" : " (optional)"}
                </TooltipContent>
              </Tooltip>
            </Th>
          ))}
        </Tr>
      </THead>
      <TBody>
        {rows.map((e) => (
          <Tr key={e.engagement_id}>
            <Td>
              <Link href={`/engagements/${e.engagement_id}`} className="font-medium underline-offset-2 hover:underline">
                {e.subcontractor_name}
              </Link>
              <div className="mt-1">
                <GlanceBadge glance={e.glance} />
              </div>
            </Td>
            {e.requirements.map((r) => (
              <Td key={r.code} className="text-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex items-center gap-0.5">
                      {r.status ? <StatusIcon status={r.status} /> : <span className="text-muted-foreground">—</span>}
                      {r.decided && <Check className="size-3" aria-hidden />}
                      <span className="sr-only">
                        {r.status ? STATUS_SHORT[r.status] : "Not assessed"}
                        {r.decided ? ", decided by a person" : ""}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {r.code}: {r.status ? STATUS_LABEL[r.status] : "Not assessed yet"}
                    {r.decided ? ` · decided by ${r.decided_by ?? "a person"}` : r.status ? " · awaiting a decision" : ""}
                    {r.open_request ? " · new upload requested" : ""}
                  </TooltipContent>
                </Tooltip>
              </Td>
            ))}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
