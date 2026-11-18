"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";

import { ErrorBox } from "@/components/Banners";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { documentFileUrl, getDocumentPages, listFindings } from "@/lib/api";
import { findQuoteRange, type Mark, segmentPage } from "@/lib/highlight";
import { VIEWER_TEXT } from "@/lib/labels";
import { queryKeys } from "@/lib/queries";
import type { DocumentPages } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function DocumentViewer({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ page?: string; quote?: string }>;
}) {
  const { documentId } = use(params);
  const { page: pageParam, quote: quoteParam = "" } = use(searchParams);
  // The quote that is scrolled to. A link from a finding sets it, and so does clicking a cited quote below.
  const [quote, setQuote] = useState(quoteParam);
  const [doc, setDoc] = useState<DocumentPages | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1));
  const mark = useRef<HTMLElement>(null);

  useEffect(() => {
    let ignore = false;
    getDocumentPages(documentId)
      .then((d) => {
        if (!ignore) setDoc(d);
      })
      .catch((err: unknown) => {
        if (!ignore) setError(errorText(err));
      });
    return () => {
      ignore = true;
    };
  }, [documentId]);

  const current = doc ? Math.min(page, doc.page_count) : page;
  const text = doc?.pages[current - 1] ?? "";
  const findingsQ = useQuery({
    queryKey: queryKeys.findings(doc?.engagement_id ?? ""),
    queryFn: () => listFindings(doc?.engagement_id ?? ""),
    enabled: !!doc,
  });
  // Every verified quote in the latest findings that points at this document.
  const cited = useMemo(
    () =>
      (findingsQ.data ?? []).flatMap((f) =>
        f.evidence.filter((e) => e.document_id === documentId && e.verified).map((e) => ({ f, e })),
      ),
    [findingsQ.data, documentId],
  );
  const range = useMemo(() => (quote ? findQuoteRange(text, quote) : null), [text, quote]);
  const segments = useMemo(() => {
    const marks: Mark[] = [];
    for (const { e } of cited) {
      if (e.page !== current) continue;
      const r = findQuoteRange(text, e.quote);
      if (r) marks.push({ range: r });
    }
    if (range) marks.push({ range, active: true });
    return segmentPage(text, marks);
  }, [cited, current, text, range]);

  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current, range, doc]);

  if (error)
    return (
      <>
        <PageHeader title="Document" />
        <PageBody>
          <ErrorBox>{error}</ErrorBox>
        </PageBody>
      </>
    );
  if (!doc)
    return (
      <>
        <PageHeader title="Document" />
        <PageBody>
          <Skeleton className="h-60 w-full" />
        </PageBody>
      </>
    );

  return (
    <>
      <PageHeader title={doc.filename} subtitle={`Page ${current} of ${doc.page_count}`} />
      <PageBody>
      <p>
        <Link
          href={`/engagements/${doc.engagement_id}`}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Back to the findings
        </Link>
      </p>
      

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          unavailable={current <= 1}
          unavailableReason="This is the first page."
          onClick={() => setPage(current - 1)}
        >
          Previous page
        </Button>
        <Button
          variant="outline"
          unavailable={current >= doc.page_count}
          unavailableReason="This is the last page."
          onClick={() => setPage(current + 1)}
        >
          Next page
        </Button>
        <a
          href={documentFileUrl(doc.id, current)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:text-muted-foreground"
        >
          {VIEWER_TEXT.original}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      <p className="text-xs text-muted-foreground">{VIEWER_TEXT.originalWarning}</p>

      <Card>
        <CardContent>
        {quote && (
          <p className="mb-2 text-xs text-muted-foreground">
            {range ? VIEWER_TEXT.legend : VIEWER_TEXT.notFound}
          </p>
        )}
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
          {segments.map((s, i) =>
            s.mark === "none" ? (
              s.text
            ) : s.mark === "active" ? (
              <mark key={i} ref={mark} className="rounded bg-model/40 px-0.5 text-foreground underline decoration-model-ink decoration-2 underline-offset-2">
                {s.text}
              </mark>
            ) : (
              <mark key={i} className="rounded bg-muted px-0.5 text-foreground underline decoration-muted-foreground decoration-1 underline-offset-2">
                {s.text}
              </mark>
            ),
          )}
        </pre>
        {!text && <p className="text-sm text-muted-foreground">No readable text on this page. It may be a scan.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-1 text-sm font-medium">Cited in this document</h2>
          {findingsQ.isPending ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : cited.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requirement cites this document.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {cited.map(({ f, e }, i) => (
                <li key={`${f.id}:${i}`} className="space-y-1 py-2 first:pt-0 last:pb-0">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{f.requirement_code}</span>
                    <span className="font-medium">{f.requirement_title}</span>
                    <StatusBadge status={f.human_status ?? f.ai_status} short />
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPage(e.page);
                      setQuote(e.quote);
                    }}
                    className="block w-full text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Page {e.page}: &ldquo;{e.quote}&rdquo;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{VIEWER_TEXT.note}</p>
      </PageBody>
    </>
  );
}
