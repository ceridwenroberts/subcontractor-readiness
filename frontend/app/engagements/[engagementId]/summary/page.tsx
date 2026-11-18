"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { use, useEffect, useState } from "react";

import { ErrorBox } from "@/components/Banners";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { NoDocumentBadge } from "@/components/NoDocumentBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getEngagement, getProject, getSummary } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { SUMMARY_TEXT } from "@/lib/labels";
import type { Summary } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function SummaryPage({ params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = use(params);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engagementQ = useQuery({ queryKey: queryKeys.engagement(engagementId), queryFn: () => getEngagement(engagementId) });
  const projectQ = useQuery({
    queryKey: queryKeys.project(engagementQ.data?.project_id ?? ""),
    queryFn: () => getProject(engagementQ.data?.project_id ?? ""),
    enabled: !!engagementQ.data,
  });

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

  // "Local model (qwen2.5:7b)": the provider label always shows (product rule), the model name is Model details.
  const parsed = /^(.*?) \((.*)\)$/.exec(summary.assessed_by);
  const assessedLabel = parsed ? parsed[1] : summary.assessed_by;
  const assessedModel = parsed ? parsed[2] : null;

  return (
    <>
      <PageHeader
        title={summary.title}
        subtitle={
          <>
            {SUMMARY_TEXT.assessedBy}: {assessedLabel}
            {assessedModel && <span className="dev-only dev-ink"> ({assessedModel})</span>}
          </>
        }
      />
      <PageBody>
      <p>
        <Link
          href={`/engagements/${engagementId}`}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          {projectQ.data ? `Back to ${projectQ.data.name} findings` : SUMMARY_TEXT.back}
        </Link>
      </p>
      <p className="text-sm">{summary.intro}</p>

      {summary.groups.map((g) => (
        <Card key={g.status}>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              {g.status === "no_document" ? <NoDocumentBadge /> : <StatusBadge status={g.status} />}
              <span className="text-sm font-normal text-muted-foreground">{g.items.length}</span>
            </h2>
          </CardHeader>
          <CardContent>
          <ul className="divide-y divide-border text-sm">
            {g.items.map((i) => (
              <li key={i.code} className="py-2 first:pt-0 last:pb-0">
                <Link
                  href={`/engagements/${engagementId}?review=${encodeURIComponent(i.code)}`}
                  className="underline-offset-2 hover:underline"
                >
                  <span className="font-mono text-xs text-muted-foreground">{i.code}</span> {i.title}
                </Link>
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
