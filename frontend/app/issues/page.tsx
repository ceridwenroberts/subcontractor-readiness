"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorBox } from "@/components/Banners";
import { cn } from "@/components/cn";
import { issueCount } from "@/components/issueCounts";
import { ExpiringList, OpenRequestsTable } from "@/components/IssuesPanel";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL, getHealth, listExpiring, listOpenRequests } from "@/lib/api";
import { REQUEST_TEXT } from "@/lib/labels";
import { queryKeys } from "@/lib/queries";
import type { ExpiryTier } from "@/lib/schemas";

type Filter = "all" | "expiry" | "upload";

const TIER_LABEL: Record<ExpiryTier, string> = {
  expired: "Expired",
  urgent: "Urgent",
  soon: "Soon",
  upcoming: "Upcoming",
};

export default function IssuesPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth, retry: 0 });
  const expiringQ = useQuery({ queryKey: queryKeys.expiring, queryFn: listExpiring, enabled: health.isSuccess });
  const requestsQ = useQuery({ queryKey: queryKeys.openRequests, queryFn: listOpenRequests, enabled: health.isSuccess });
  const [filter, setFilter] = useState<Filter>("all");
  const expiring = expiringQ.data ?? [];
  const requests = requestsQ.data ?? [];
  const offline = health.isError;
  // Until both lists have arrived we know nothing, so never show "nothing to follow up".
  const loading = !offline && (health.isPending || expiringQ.isPending || requestsQ.isPending);
  const known = !loading && !offline;
  const dash = (n: number) => (known ? String(n) : "—");
  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: issueCount(expiring, requests) },
    { value: "expiry", label: "Close to expiry", count: expiring.length },
    { value: "upload", label: "Waiting for a new upload", count: requests.length },
  ];
  const countOf = (t: ExpiryTier) => expiring.filter((i) => i.tier === t).length;

  return (
    <>
      <PageHeader
        title="Issues"
        subtitle="Document dates close to running out, and requests waiting for a new upload."
      />
      <PageBody>
        {health.error && (
          <ErrorBox>{`Cannot reach the backend at ${API_URL}. Check that it is running, then reload.`}</ErrorBox>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter issues">
          {filters.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({dash(f.count)})
            </Button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
          <div className="space-y-4">
            {loading && <Skeleton className="h-24 w-full" />}
            {(filter === "all" || filter === "expiry") && known && (
              <Card>
                <CardHeader>
                  <CardTitle>Documents close to expiry</CardTitle>
                  <CardDescription>
                    Most urgent first. Based on the dates the assessment read from the documents. Reminder drafts are
                    simulated: nothing is sent.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-0">
                  <ExpiringList items={expiring} />
                </CardContent>
              </Card>
            )}
            {(filter === "all" || filter === "upload") && known && (
              <Card>
                <CardHeader>
                  <CardTitle>{REQUEST_TEXT.dashboardTitle}</CardTitle>
                  <CardDescription>{REQUEST_TEXT.dashboardHelp}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className={cn(requests.length === 0 && "px-4 py-3")}>
                    <OpenRequestsTable requests={requests} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <aside className="rounded-xl border border-border p-4 text-sm lg:sticky lg:top-4" aria-label="Issue summary">
            <h2 className="mb-2 text-sm font-semibold">Summary</h2>
            <dl className="divide-y divide-border">
              {(Object.keys(TIER_LABEL) as ExpiryTier[]).map((t) => (
                <div key={t} className="flex items-center justify-between py-1.5">
                  <dt className="text-muted-foreground">{TIER_LABEL[t]}</dt>
                  <dd className="font-medium">{dash(countOf(t))}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-muted-foreground">Waiting for a new upload</dt>
                <dd className="font-medium">{dash(requests.length)}</dd>
              </div>
              <div className="flex items-center justify-between pt-2">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold">{dash(issueCount(expiring, requests))}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
