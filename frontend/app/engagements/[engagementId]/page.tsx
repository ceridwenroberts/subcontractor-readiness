"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { FindingCard } from "@/components/FindingCard";
import { Card, ErrorBox, PlaceholderBanner, buttonClass, inputClass, linkClass } from "@/components/ui";
import {
  assessEngagement,
  getEngagement,
  getProject,
  getTemplate,
  listDocuments,
  listFindings,
  uploadDocuments,
} from "@/lib/api";
import { DISCLAIMER } from "@/lib/labels";
import type {
  DocumentInfo,
  Engagement,
  FileReport,
  Finding,
  TemplateDetail,
} from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function EngagementPage({ params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = use(params);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reports, setReports] = useState<FileReport[]>([]);

  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("");

  const refresh = useCallback(async () => {
    const [docs, found] = await Promise.all([listDocuments(engagementId), listFindings(engagementId)]);
    setDocuments(docs);
    setFindings(found);
  }, [engagementId]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const e = await getEngagement(engagementId);
      const p = await getProject(e.project_id);
      const t = await getTemplate(p.template_id);
      const [docs, found] = await Promise.all([listDocuments(engagementId), listFindings(engagementId)]);
      if (ignore) return;
      setEngagement(e);
      setTemplate(t);
      setDocuments(docs);
      setFindings(found);
    })().catch((err: unknown) => {
      if (!ignore) setLoadError(errorText(err));
    });
    return () => {
      ignore = true;
    };
  }, [engagementId]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploading(true);
    setUploadError(null);
    setReports([]);
    try {
      const result = await uploadDocuments(engagementId, picked);
      setReports(result.files);
      if (result.message) setUploadError(result.message);
      setPicked([]);
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (err) {
      setUploadError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  async function onAssess() {
    setAssessing(true);
    setAssessError(null);
    try {
      setFindings(await assessEngagement(engagementId));
    } catch (err) {
      setAssessError(errorText(err));
    } finally {
      setAssessing(false);
    }
  }

  function onFindingChanged(updated: Finding) {
    setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }

  if (loadError) return <ErrorBox>{loadError}</ErrorBox>;
  if (!engagement || !template) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <main className="space-y-6">
      <p className="text-sm">
        <Link href={`/projects/${engagement.project_id}`} className={linkClass}>
          ← Back to project
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold">{engagement.subcontractor_name}</h1>
        <p className="text-sm text-slate-600">Template: {template.name}</p>
      </div>
      {template.placeholder && <PlaceholderBanner />}

      <Card>
        <h2 className="mb-1 text-lg font-medium">1. Upload documents</h2>
        <p className="mb-3 text-sm text-slate-600">
          PDF files only, up to 10 MB and 50 pages each, up to 10 files at a time. Scanned pages are
          not read yet. Use synthetic documents only.
        </p>
        <form onSubmit={onUpload} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm">
            <span className="mb-1 block font-medium">Choose PDF files</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className={inputClass}
              onChange={(e) => setPicked(Array.from(e.target.files ?? []))}
            />
          </label>
          <button className={buttonClass} disabled={uploading || picked.length === 0}>
            {uploading ? "Uploading…" : `Upload ${picked.length || ""} file${picked.length === 1 ? "" : "s"}`}
          </button>
        </form>
        {uploadError && (
          <div className="mt-3">
            <ErrorBox>{uploadError}</ErrorBox>
          </div>
        )}
        {reports.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {reports.map((r, i) => (
              <li
                key={i}
                className={`rounded-md border p-2 ${r.status === "accepted" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
              >
                {r.status === "accepted" ? (
                  <span>{r.filename}: uploaded.</span>
                ) : (
                  <span>
                    {r.message} {r.hint}
                  </span>
                )}
                {r.warnings.map((w, j) => (
                  <p key={j} className="mt-1 text-amber-900">
                    Note: {w}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-1 mt-5 text-sm font-medium">Uploaded documents ({documents.length})</h3>
        {documents.length === 0 && <p className="text-sm text-slate-600">Nothing uploaded yet.</p>}
        <ul className="space-y-1 text-sm">
          {documents.map((d) => (
            <li key={d.id}>
              {d.filename} · {d.page_count} page{d.page_count === 1 ? "" : "s"}
              {d.warnings.map((w, j) => (
                <p key={j} className="ml-3 text-xs text-amber-900">
                  Note: {w}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-medium">2. Assess</h2>
        <p className="mb-3 text-sm text-slate-600">
          Each requirement is checked against the uploaded documents. Every quote is then verified
          against the stored text. With a local model this can take about a minute.
        </p>
        <button className={buttonClass} onClick={onAssess} disabled={assessing || documents.length === 0}>
          {assessing ? "Assessing… please wait" : findings.length ? "Assess again" : "Assess documents"}
        </button>
        {assessing && (
          <p role="status" className="mt-2 text-sm text-slate-600">
            Reading the documents and checking each requirement. Do not close this page.
          </p>
        )}
        {assessError && (
          <div className="mt-3">
            <ErrorBox>{assessError}</ErrorBox>
          </div>
        )}
        {findings.length > 0 && !assessing && (
          <p className="mt-2 text-xs text-slate-600">
            Assessing again adds new findings. Earlier findings and your decisions on them are kept.
          </p>
        )}
      </Card>

      {findings.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-medium">3. Findings ({findings.length})</h2>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Your name (for the decision log)</span>
              <input
                className={inputClass}
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                maxLength={100}
                placeholder="For example: Test PM"
              />
            </label>
          </div>
          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} reviewer={reviewer} onChanged={onFindingChanged} />
          ))}
        </section>
      )}

      <p className="border-t border-slate-200 pt-3 text-xs text-slate-600">{DISCLAIMER}</p>
    </main>
  );
}
