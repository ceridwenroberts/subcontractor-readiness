"use client";

import { FileText, Timer, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/components/cn";
import { ErrorBox } from "@/components/Banners";
import { uploadDocuments } from "@/lib/api";
import { FILE_PROBLEM_TEXT, LIMITS, checkFiles, isBlocking, type FileProblem } from "@/lib/forms";
import type { DocumentInfo, FileReport } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

type Item = {
  id: number;
  file: File;
  force: boolean; // upload even though a file with this name and size already exists
  report: FileReport | null; // set when the server refused it
  state: "queued" | "uploading";
};

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Warnings about a scan are shown as "not read yet", the others as plain notes. */
export const isScanWarning = (w: string) => /scan/i.test(w);

export function ScanTag({ warning }: { warning: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="dashed" tabIndex={0}>
          <Timer className="size-3" aria-hidden />
          Scan detected, not read yet
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{warning}</TooltipContent>
    </Tooltip>
  );
}

/** Pick or drop several PDFs, review them one by one, then upload them in one request. */
export function UploadDropzone({
  engagementId,
  documents,
  onUploaded,
  onAssess,
  listUploaded = true,
}: {
  engagementId: string;
  documents: DocumentInfo[];
  onUploaded: () => Promise<void> | void;
  onAssess: () => void;
  /** Show the list of already uploaded documents under the queue. */
  listUploaded?: boolean;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = useMemo(
    () => checkFiles(items.map((i) => i.file), documents.map((d) => ({ name: d.filename }))),
    [items, documents],
  );
  const problemOf = (index: number): FileProblem | null => {
    const p = checks[index]?.problem ?? null;
    return p === "already_uploaded" && items[index].force ? null : p;
  };
  const sendable = items.filter((_, i) => {
    const p = problemOf(i);
    return p === null;
  });
  const waitingOnYou = items.filter((_, i) => problemOf(i) === "already_uploaded").length;

  function add(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({ id: nextId.current++, file, force: false, report: null, state: "queued" as const })),
    ]);
    if (input.current) input.current.value = "";
  }

  const remove = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));
  const allowDuplicate = (id: number) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, force: true } : i)));

  async function onUpload() {
    if (uploading || sendable.length === 0) return;
    const sending = sendable;
    const ids = sending.map((i) => i.id);
    setUploading(true);
    setError(null);
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, state: "uploading" as const, report: null } : i)));
    try {
      const result = await uploadDocuments(
        engagementId,
        sending.map((i) => i.file),
      );
      const accepted = result.files.filter((r) => r.status === "accepted").length;
      const rejected = result.files.length - accepted;
      setItems((prev) =>
        prev.flatMap((i) => {
          const at = ids.indexOf(i.id);
          if (at === -1) return [i];
          const report = result.files[at];
          if (!report || report.status === "accepted") return [];
          return [{ ...i, state: "queued" as const, report }];
        }),
      );
      if (result.message && accepted === 0) setError(result.message);
      await onUploaded();
      if (accepted > 0) {
        toast(`${accepted} file${accepted === 1 ? "" : "s"} uploaded${rejected ? `, ${rejected} not accepted` : ""}.`, {
          action: { label: "Assess documents", onClick: onAssess },
        });
      } else if (rejected > 0) {
        toast(`${rejected} file${rejected === 1 ? " was" : "s were"} not accepted. See the list.`);
      }
    } catch (err) {
      setError(errorText(err));
      setItems((prev) => prev.map((i) => ({ ...i, state: "queued" })));
    } finally {
      setUploading(false);
    }
  }

  const blockedReason =
    sendable.length === 0
      ? items.length === 0
        ? "Choose or drop PDF files first."
        : waitingOnYou > 0
          ? "Remove the files that were already uploaded, or choose Upload anyway."
          : "Fix or remove the files marked in the list."
      : undefined;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "relative flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring hover:border-foreground hover:bg-subtle",
          over ? "border-foreground bg-muted" : "border-input",
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <label htmlFor={inputId} className="text-sm font-medium after:absolute after:inset-0 after:cursor-pointer">
          Drop PDF files here, or choose files
        </label>
        <p className="text-xs text-muted-foreground">
          PDF only, up to {LIMITS.maxFileMb} MB and 50 pages each, up to {LIMITS.maxFiles} files at a time. Scanned
          pages are not read yet. Use synthetic documents only.
        </p>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => add(Array.from(e.target.files ?? []))}
        />
      </div>

      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {items.map((item, index) => {
            const problem = problemOf(index);
            const warn = checks[index]?.problem === "already_uploaded" && !item.force;
            const bad = (problem !== null && isBlocking(problem)) || item.report?.status === "rejected";
            return (
              <li key={item.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {item.file.name}{" "}
                    <span className="font-normal text-muted-foreground">{formatSize(item.file.size)}</span>
                  </p>
                  {item.state === "uploading" && <p className="text-xs text-muted-foreground">Uploading…</p>}
                  {item.state === "queued" && !bad && !warn && (
                    <p className="text-xs text-muted-foreground">Ready to upload</p>
                  )}
                  {bad && (
                    <p role="alert" className="text-xs text-foreground">
                      <strong>Not accepted.</strong>{" "}
                      {item.report?.status === "rejected"
                        ? `${item.report.message ?? ""} ${item.report.hint ?? ""}`
                        : problem
                          ? FILE_PROBLEM_TEXT[problem]
                          : ""}
                    </p>
                  )}
                  {warn && <p className="text-xs text-foreground">{FILE_PROBLEM_TEXT.already_uploaded}</p>}
                </div>
                {warn && (
                  <Button variant="outline" size="sm" onClick={() => allowDuplicate(item.id)}>
                    Upload anyway
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(item.id)}
                  disabled={item.state === "uploading"}
                  aria-label={`Remove ${item.file.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={onUpload}
          loading={uploading}
          loadingText="Uploading…"
          unavailable={sendable.length === 0 && !uploading}
          unavailableReason={blockedReason}
        >
          <Upload className="size-3.5" aria-hidden />
          {sendable.length > 0 ? `Upload ${sendable.length} file${sendable.length === 1 ? "" : "s"}` : "Upload files"}
        </Button>
        {items.length > 0 && !uploading && (
          <Button variant="ghost" onClick={() => setItems([])}>
            Clear list
          </Button>
        )}
        {blockedReason && items.length > 0 && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
      </div>

      {listUploaded && (
      <div>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">Uploaded documents ({documents.length})</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {d.filename}{" "}
                    <span className="font-normal text-muted-foreground">
                      {d.page_count} page{d.page_count === 1 ? "" : "s"}
                    </span>
                  </p>
                  {d.warnings.map((w, j) =>
                    isScanWarning(w) ? (
                      <div key={j} className="mt-1">
                        <ScanTag warning={w} />
                      </div>
                    ) : (
                      <p key={j} className="text-xs text-muted-foreground">
                        Note: {w}
                      </p>
                    ),
                  )}
                </div>
                <Link
                  href={`/documents/${d.id}`}
                  className="text-xs text-foreground underline underline-offset-2 hover:text-muted-foreground"
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
