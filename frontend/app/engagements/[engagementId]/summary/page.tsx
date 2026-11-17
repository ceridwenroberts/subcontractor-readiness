"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { ErrorBox } from "@/components/Banners";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

  if (error)
    return (
      <>
        <PageHeader title="Summary" />
        <PageBody>
          <ErrorBox>{error}</ErrorBox>
        </PageBody>
      </>
    );
  if (!summary)
    return (
      <>
        <PageHeader title="Summary" />
        <PageBody>
          <Skeleton className="h-40 w-full" />
        </PageBody>
      </>
    );

  return (
    <>
      <PageHeader title={summary.title} subtitle={`${SUMMARY_TEXT.assessedBy}: ${summary.assessed_by}`} />
      <PageBody>
      <p>
        <Link
          href={`/engagements/${engagementId}`}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          {SUMMARY_TEXT.back}
        </Link>
      </p>
      <p className="text-sm">{summary.intro}</p>

      {summary.groups.map((g) => (
        <Card key={g.status}>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <StatusBadge status={g.status} />
              <span className="text-sm font-normal text-muted-foreground">{g.items.length}</span>
            </h2>
          </CardHeader>
          <CardContent>
          <ul className="divide-y divide-border text-sm">
            {g.items.map((i) => (
              <li key={i.code} className="py-2 first:pt-0 last:pb-0">
                <span className="font-mono text-xs text-muted-foreground">{i.code}</span> {i.title}
                <span className="block text-xs text-muted-foreground">
                  {i.reviewed_by_person ? SUMMARY_TEXT.reviewed : SUMMARY_TEXT.notReviewed}
                  {i.note ? ` · ${i.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
          </CardContent>
        </Card>
      ))}

      <p className="text-sm">{summary.not_reviewed_text}</p>
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">{summary.disclaimer}</p>
      </PageBody>
    </>
  );
}
