"use client";

import { CalendarClock, Mail, Timer, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/components/cn";
import { EmailDraftSheet } from "@/components/EmailDraftSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { REQUEST_TEXT } from "@/lib/labels";
import type { ExpiringItem, ExpiryTier, OpenRequest } from "@/lib/schemas";
import { formatWhen } from "@/lib/time";

const TIER: Record<ExpiryTier, { label: string; icon: LucideIcon; style: string }> = {
  expired: { label: "Expired", icon: Timer, style: "border-foreground bg-foreground text-background" },
  urgent: { label: "Urgent", icon: TriangleAlert, style: "border-foreground bg-foreground text-background" },
  soon: { label: "Soon", icon: CalendarClock, style: "border-foreground bg-background text-foreground font-semibold" },
  upcoming: { label: "Upcoming", icon: CalendarClock, style: "border-dashed border-muted-foreground text-muted-foreground" },
};

export const whenText = (days: number) =>
  days < 0
    ? `Expired ${-days} day${days === -1 ? "" : "s"} ago`
    : days === 0
      ? "Expires today"
      : `Expires in ${days} day${days === 1 ? "" : "s"}`;

/** Documents whose date is close to running out, most urgent first. Urgency is shown by order, icon and words. */
export function ExpiringList({ items }: { items: ExpiringItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No document dates are close to running out.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((i) => {
        const t = TIER[i.tier];
        const Icon = t.icon;
        return (
          <li key={i.finding_id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-2.5">
            <div className="min-w-0 space-y-0.5">
              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                <span
                  className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-px text-xs", t.style)}
                >
                  <Icon className="size-3" aria-hidden />
                  {t.label}
                </span>
                <strong className="font-medium">{whenText(i.days_left)}</strong>
                <span className="text-xs text-muted-foreground">({i.valid_until})</span>
              </p>
              <p className="text-sm font-medium">
                <Link href={`/projects/${i.project_id}`} className="underline-offset-2 hover:underline">
                  {i.project_name}
                </Link>
                <span className="font-normal text-muted-foreground"> · </span>
                {i.subcontractor_name}
              </p>
              <p className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{i.requirement_code}</span>{" "}
                {i.requirement_title}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <StatusBadge status={i.status} short />
                {i.new_upload_requested && <Badge variant="outline">New upload requested</Badge>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {i.reminder && (
                <EmailDraftSheet
                  heading={`Reminder draft (${i.reminder.kind === "before_expiry" ? "before expiry" : "at expiry"})`}
                  to={i.reminder.to}
                  subject={i.reminder.subject}
                  body={i.reminder.body}
                  trigger="View reminder draft"
                />
              )}
              <Link
                href={`/engagements/${i.engagement_id}`}
                className="text-xs underline underline-offset-2 hover:text-muted-foreground"
              >
                Open subcontractor
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OpenRequestsTable({ requests }: { requests: OpenRequest[] }) {
  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">{REQUEST_TEXT.dashboardEmpty}</p>;
  }
  return (
    <div className="rounded-md border border-border">
      <Table className="min-w-[40rem]">
        <THead>
          <Tr>
            <Th>Project</Th>
            <Th>Subcontractor</Th>
            <Th>Requirement</Th>
            <Th>Reason</Th>
            <Th>Request</Th>
            <Th>
              <span className="sr-only">Open</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {requests.map((r) => (
            <Tr key={r.request_id}>
              <Td>
                <Link href={`/projects/${r.project_id}`} className="font-medium underline-offset-2 hover:underline">
                  {r.project_name}
                </Link>
              </Td>
              <Td className="font-medium">{r.subcontractor_name}</Td>
              <Td>
                <span className="font-mono text-xs text-muted-foreground">{r.requirement_code}</span>{" "}
                {r.requirement_title}
              </Td>
              <Td>{r.reason_label}</Td>
              <Td className="text-xs">
                <span className="inline-flex items-center gap-1">
                  {r.email_recorded && <Mail className="size-3" aria-hidden />}
                  {r.email_recorded ? REQUEST_TEXT.emailRecorded : REQUEST_TEXT.noEmail}
                </span>
                <span className="block text-muted-foreground">
                  {r.requested_by} · {formatWhen(r.created_at)}
                </span>
              </Td>
              <Td className="text-right">
                <Link
                  href={`/engagements/${r.engagement_id}`}
                  className="text-xs underline underline-offset-2 hover:text-muted-foreground"
                >
                  Open subcontractor
                </Link>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
