"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownUp, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { NotAssessedAction } from "@/components/NotAssessedAction";
import { StatusBadge } from "@/components/StatusBadge";
import { ScanTag, isScanWarning } from "@/components/UploadDropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { viewerPath } from "@/lib/api";
import { STATUSES, STATUS_SHORT } from "@/lib/labels";
import type { DocumentInfo, Finding, Status, TemplateDetail } from "@/lib/schemas";

type Requirement = TemplateDetail["requirements"][number];
type Cited = { id: string; name: string; page: number; quote: string };
type Row = {
  requirement: Requirement;
  finding: Finding | null;
  status: Status | "none";
  cited: Cited[];
};

const NONE = "none" as const;

/** The documents a result is based on: only quotes that were found in the document text. */
function citedDocuments(f: Finding | null): Cited[] {
  if (!f) return [];
  const seen = new Set<string>();
  const out: Cited[] = [];
  for (const e of f.evidence) {
    if (!e.verified) continue;
    const key = `${e.document_id}:${e.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: e.document_id, name: e.document_name, page: e.page, quote: e.quote });
  }
  return out;
}

/**
 * Every requirement in the template, always visible, with its result. Before an assessment each
 * has an Upload or Assess button instead of a result. Each row opens to the description, what the check looks for, and the
 * finding with its quotes and decision. Documents that no requirement cites are listed below.
 */
export function RequirementsTable({
  template,
  findings,
  documents,
  onReview,
  onUpload,
  onAssess,
  assessing,
}: {
  template: TemplateDetail;
  findings: Finding[];
  documents: DocumentInfo[];
  /** Open the review panel for a requirement (its finding and decision). */
  onReview: (code: string) => void;
  /** A requirement with no result: upload a document (none yet) or assess the ones that are there. */
  onUpload: (code?: string) => void;
  onAssess: () => void;
  assessing: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);

  const rows = useMemo<Row[]>(() => {
    const byCode = new Map(findings.map((f) => [f.requirement_code, f]));
    return template.requirements.map((requirement) => {
      const finding = byCode.get(requirement.code) ?? null;
      return {
        requirement,
        finding,
        status: finding ? finding.ai_status : NONE,
        cited: citedDocuments(finding),
      };
    });
  }, [template, findings]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "requirement",
        header: "Requirement",
        accessorFn: (r) => r.requirement.code,
        cell: ({ row }) => {
          const r = row.original.requirement;
          return (
            <button
              type="button"
              onClick={() => onReview(r.code)}
              className="flex items-start gap-1.5 rounded text-left hover:text-muted-foreground"
            >
              <span>
                <span className="font-mono text-xs text-muted-foreground">{r.code}</span>{" "}
                <span className="font-medium">{r.title}</span>
                {!r.mandatory && <span className="text-xs text-muted-foreground"> (optional)</span>}
                {r.expires && <span className="text-xs text-muted-foreground"> · has an expiry date</span>}
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status,
        sortingFn: (a, b) =>
          [...STATUSES, NONE].indexOf(a.original.status) - [...STATUSES, NONE].indexOf(b.original.status),
        filterFn: (row, _id, value: string) => value === "" || row.original.status === value,
        cell: ({ row }) => {
          const { finding, status } = row.original;
          return (
            <span className="flex flex-wrap items-center gap-1">
              {status === NONE ? (
                <NotAssessedAction
                  documentCount={documents.length}
                  assessing={assessing}
                  onUpload={() => onUpload(row.original.requirement.code)}
                  onAssess={onAssess}
                />
              ) : (
                <StatusBadge status={status} short />
              )}
              {finding?.human_status && <StatusBadge status={finding.human_status} prefix="Decision" short />}
              {finding?.latest_request && <Badge variant="outline">New upload requested</Badge>}
            </span>
          );
        },
      },
      {
        id: "documents",
        header: "Documents",
        accessorFn: (r) => r.cited.length,
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) =>
          row.original.cited.length === 0 ? (
            <span className="text-xs text-muted-foreground">{row.original.finding ? "None cited" : "—"}</span>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {row.original.cited.map((c) => (
                <li key={`${c.id}:${c.page}`}>
                  <Link
                    onClick={(e) => e.stopPropagation()}
                    href={viewerPath(c.id, c.page, c.quote)}
                    className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-muted-foreground"
                  >
                    <FileText className="size-3" aria-hidden />
                    {c.name}, page {c.page}
                  </Link>
                </li>
              ))}
            </ul>
          ),
      },
      {
        id: "date",
        header: "Date in documents",
        accessorFn: (r) => r.finding?.valid_until ?? "",
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (
          <span className="text-xs">{row.original.finding?.valid_until ?? <span className="text-muted-foreground">—</span>}</span>
        ),
      },
    ],
    [onReview, documents.length, assessing, onUpload, onAssess],
  );

  // TanStack Table returns functions React Compiler cannot memoize; this component opts out safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters: filters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    getRowId: (r) => r.requirement.code,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const activeFilter = (filters.find((f) => f.id === "status")?.value as string | undefined) ?? "";
  const counts = useMemo(() => {
    const c: Record<string, number> = { "": rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const setFilter = (value: string) => setFilters(value ? [{ id: "status", value }] : []);

  const citedIds = new Set(rows.flatMap((r) => r.cited.map((c) => c.id)));
  const uncited = documents.filter((d) => !citedIds.has(d.id));
  const assessed = findings.length > 0;

  const chips: { value: string; label: string }[] = [
    { value: "", label: "All" },
    ...STATUSES.filter((s) => counts[s]).map((s) => ({ value: s, label: STATUS_SHORT[s] })),
    ...(counts[NONE] ? [{ value: NONE, label: documents.length === 0 ? "Needs a document" : "Ready to assess" }] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-sm">
        <p>
          These are the documents the <strong>{template.name}</strong> template asks for ({template.requirements.length}{" "}
          requirements, version {template.version}). They are pre-selected from the template and can&apos;t be edited
          here. Open a row to see what it means, what the check looks for, and the result.
        </p>
        {!assessed && (
          <p className="text-muted-foreground">
            {documents.length === 0
              ? "Upload documents first. Each row then gets a result when you assess them."
              : "Choose Assess to get a result for each row."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
        {chips.map((c) => (
          <Button
            key={c.value || "all"}
            size="sm"
            variant={activeFilter === c.value ? "default" : "outline"}
            aria-pressed={activeFilter === c.value}
            onClick={() => setFilter(c.value)}
          >
            {c.label} ({counts[c.value] ?? 0})
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSorting(sorting.length ? [] : [{ id: "status", desc: false }])}
          aria-pressed={sorting.length > 0}
        >
          <ArrowDownUp className="size-3.5" aria-hidden />
          {sorting.length ? "Template order" : "Sort by status"}
        </Button>
      </div>

      <div className="rounded-md border border-border">
        <Table className="min-w-[28rem]">
          <THead>
            <Tr>
              {table.getHeaderGroups()[0].headers.map((h) => (
                <Th
                  key={h.id}
                  className={(h.column.columnDef.meta as { className?: string } | undefined)?.className}
                  aria-sort={
                    h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : undefined
                  }
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {table.getRowModel().rows.length === 0 && (
              <Tr>
                <Td colSpan={columns.length} className="text-muted-foreground">
                  No requirements have this status.
                </Td>
              </Tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <Tr
                key={row.id}
                onClick={() => onReview(row.original.requirement.code)}
                className="cursor-pointer transition-colors hover:bg-subtle"
              >
                {row.getVisibleCells().map((cell) => (
                  <Td
                    key={cell.id}
                    className={(cell.column.columnDef.meta as { className?: string } | undefined)?.className}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>

      {documents.length > 0 && assessed && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Other uploaded documents ({uncited.length})</h3>
          {uncited.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every uploaded document is cited by a requirement.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {uncited.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {d.filename} <span className="text-xs text-muted-foreground">not cited by any requirement</span>
                  </span>
                  {d.warnings.filter(isScanWarning).map((w, j) => (
                    <ScanTag key={j} warning={w} />
                  ))}
                  <Link
                    href={`/documents/${d.id}`}
                    className="text-xs underline underline-offset-2 hover:text-muted-foreground"
                  >
                    Review text
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
