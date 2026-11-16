"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { Card, ErrorBox, StatusBadge, linkClass } from "@/components/ui";
import { getSummary } from "@/lib/api";
import { SUMMARY_TEXT } from "@/lib/labels";
import type { Summary } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function SummaryPage({ params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = use(params);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    getSummary(engagementId)
      .then((s) => {
        if (!ignore) setSummary(s);
      })
      .catch((err: unknown) => {
        if (!ignore) setError(errorText(err));
      });
    return () => {
      ignore = true;
    };
  }, [engagementId]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!summary) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <main className="space-y-4">
      <p className="text-sm">
        <Link href={`/engagements/${engagementId}`} className={linkClass}>
          {SUMMARY_TEXT.back}
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold">{summary.title}</h1>
        <p className="mt-1 text-sm text-slate-700">{summary.intro}</p>
        <p className="mt-1 text-xs text-slate-500">
          {SUMMARY_TEXT.assessedBy}: {summary.assessed_by}
        </p>
      </div>

      {summary.groups.map((g) => (
        <Card key={g.status}>
          <h2 className="mb-2 flex items-center gap-2 text-base font-medium">
            <StatusBadge status={g.status} />
            <span className="text-sm font-normal text-slate-600">{g.items.length}</span>
          </h2>
          <ul className="space-y-2 text-sm">
            {g.items.map((i) => (
              <li key={i.code}>
                <span className="font-mono text-xs text-slate-600">{i.code}</span> {i.title}
                <span className="block text-xs text-slate-600">
                  {i.reviewed_by_person ? SUMMARY_TEXT.reviewed : SUMMARY_TEXT.notReviewed}
                  {i.note ? ` · ${i.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <p className="text-sm text-slate-700">{summary.not_reviewed_text}</p>
      <p className="border-t border-slate-200 pt-3 text-xs text-slate-600">{summary.disclaimer}</p>
    </main>
  );
}
