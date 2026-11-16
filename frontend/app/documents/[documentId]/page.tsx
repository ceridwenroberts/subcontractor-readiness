"use client";

import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";

import { ErrorBox } from "@/components/Banners";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { documentFileUrl, getDocumentPages } from "@/lib/api";
import { findQuoteRange, splitAround } from "@/lib/highlight";
import { VIEWER_TEXT } from "@/lib/labels";
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
  const { page: pageParam, quote = "" } = use(searchParams);
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
  const range = useMemo(() => (quote ? findQuoteRange(text, quote) : null), [text, quote]);
  const parts = splitAround(text, range);

  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current, range, doc]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!doc) return <Skeleton className="h-60 w-full" />;

  return (
    <main className="space-y-4">
      <p>
        <Link
          href={`/engagements/${doc.engagement_id}`}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Back to the findings
        </Link>
      </p>
      <div>
        <h1 className="text-lg font-semibold">{doc.filename}</h1>
        <p className="text-sm text-muted-foreground">
          Page {current} of {doc.page_count}
        </p>
      </div>

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
          {parts.before}
          {parts.match && (
            <mark ref={mark} className="rounded bg-model/40 px-0.5 text-foreground underline decoration-model-ink decoration-2 underline-offset-2">
              {parts.match}
            </mark>
          )}
          {parts.after}
        </pre>
        {!text && <p className="text-sm text-muted-foreground">No readable text on this page. It may be a scan.</p>}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{VIEWER_TEXT.note}</p>
    </main>
  );
}
