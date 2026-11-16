"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";

import { Card, ErrorBox, linkClass } from "@/components/ui";
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
  if (!doc) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <main className="space-y-4">
      <p className="text-sm">
        <Link href={`/engagements/${doc.engagement_id}`} className={linkClass}>
          ← Back to the findings
        </Link>
      </p>
      <div>
        <h1 className="text-xl font-semibold">{doc.filename}</h1>
        <p className="text-sm text-slate-600">
          Page {current} of {doc.page_count}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-40"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          Previous page
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-40"
          disabled={current >= doc.page_count}
          onClick={() => setPage(current + 1)}
        >
          Next page
        </button>
        <a
          href={documentFileUrl(doc.id, current)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} text-sm`}
        >
          {VIEWER_TEXT.original}
        </a>
      </div>
      <p className="text-xs text-slate-500">{VIEWER_TEXT.originalWarning}</p>

      <Card>
        {quote && (
          <p className="mb-2 text-xs text-slate-600">
            {range ? VIEWER_TEXT.legend : VIEWER_TEXT.notFound}
          </p>
        )}
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
          {parts.before}
          {parts.match && (
            <mark ref={mark} className="rounded bg-yellow-200 px-0.5 text-slate-900">
              {parts.match}
            </mark>
          )}
          {parts.after}
        </pre>
        {!text && <p className="text-sm text-slate-600">No readable text on this page. It may be a scan.</p>}
      </Card>
      <p className="text-xs text-slate-500">{VIEWER_TEXT.note}</p>
    </main>
  );
}
