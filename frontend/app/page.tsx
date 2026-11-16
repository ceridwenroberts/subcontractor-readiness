"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, ErrorBox, PlaceholderBanner, buttonClass, inputClass, linkClass } from "@/components/ui";
import { API_URL, createProject, getHealth, getRetentionAdvice, listOpenRequests, listProjects, listTemplates } from "@/lib/api";
import { REQUEST_TEXT, RETENTION_TEXT } from "@/lib/labels";
import { formatWhen } from "@/lib/time";
import type { OpenRequest, Project, RetentionAdvice, TemplateSummary } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function Home() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [advice, setAdvice] = useState<RetentionAdvice | null>(null);
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [deleteAfter, setDeleteAfter] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      getHealth(),
      listProjects(),
      listTemplates(),
      getRetentionAdvice(),
      listOpenRequests(),
    ])
      .then(([, p, t, a, o]) => {
        if (ignore) return;
        setProjects(p);
        setTemplates(t);
        setAdvice(a);
        setOpenRequests(o);
        setDeleteAfter((current) => current || a.suggested_date);
        setTemplateId((current) => current || t[0]?.id || "");
      })
      .catch((err: unknown) => {
        if (!ignore)
          setLoadError(
            `Cannot reach the backend at ${API_URL}. Check that it is running, then reload. (${errorText(err)})`,
          );
      });
    return () => {
      ignore = true;
    };
  }, []);

  const selected = templates.find((t) => t.id === templateId);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const created = await createProject(name.trim(), templateId, deleteAfter);
      setProjects((prev) => [created, ...(prev ?? [])]);
      setName("");
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Projects</h1>
      {loadError && <ErrorBox>{loadError}</ErrorBox>}

      <Card>
        <h2 className="mb-1 text-lg font-medium">
          {REQUEST_TEXT.dashboardTitle}
          {openRequests.length > 0 && (
            <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
              {openRequests.length}
            </span>
          )}
        </h2>
        <p className="mb-3 text-xs text-slate-600">{REQUEST_TEXT.dashboardHelp}</p>
        {openRequests.length === 0 ? (
          <p className="text-sm text-slate-600">{REQUEST_TEXT.dashboardEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-slate-600">
                <tr>
                  <th className="py-1 pr-3 font-medium">Project</th>
                  <th className="py-1 pr-3 font-medium">Subcontractor</th>
                  <th className="py-1 pr-3 font-medium">Requirement</th>
                  <th className="py-1 pr-3 font-medium">Reason</th>
                  <th className="py-1 pr-3 font-medium">Request</th>
                  <th className="py-1 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {openRequests.map((r) => (
                  <tr key={r.request_id}>
                    <td className="py-2 pr-3">
                      <Link href={`/projects/${r.project_id}`} className={linkClass}>
                        {r.project_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{r.subcontractor_name}</td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs text-slate-600">{r.requirement_code}</span>{" "}
                      {r.requirement_title}
                    </td>
                    <td className="py-2 pr-3">{r.reason_label}</td>
                    <td className="py-2 pr-3 text-xs text-slate-700">
                      <span
                        className={`rounded border px-1.5 py-0.5 ${
                          r.email_recorded
                            ? "border-sky-300 bg-sky-50 text-sky-900"
                            : "border-slate-300 bg-slate-50 text-slate-700"
                        }`}
                      >
                        {r.email_recorded ? REQUEST_TEXT.emailRecorded : REQUEST_TEXT.noEmail}
                      </span>
                      <span className="mt-1 block text-slate-500">
                        {r.requested_by} · {formatWhen(r.created_at)}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/engagements/${r.engagement_id}`} className={linkClass}>
                        Open documents
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-medium">New project</h2>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-[1fr_12rem_11rem_auto] sm:items-end">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Project name</span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
              placeholder="For example: Harbour Building 4"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Template</span>
            <select
              className={inputClass}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{RETENTION_TEXT.label}</span>
            <input
              type="date"
              className={inputClass}
              value={deleteAfter}
              onChange={(e) => setDeleteAfter(e.target.value)}
            />
          </label>
          <button className={buttonClass} disabled={saving || !name.trim() || !templateId}>
            {saving ? "Creating…" : "Create project"}
          </button>
        </form>
        <details className="mt-3 text-sm text-slate-700">
          <summary className="cursor-pointer select-none text-slate-600 hover:text-slate-900">
            About the deletion date
          </summary>
          <div className="mt-2 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
            <p className="font-medium">{RETENTION_TEXT.placeholder}</p>
            <p>{RETENTION_TEXT.help}</p>
            {advice && (
              <>
                <p>{advice.summary}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {advice.basis.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <ul className="list-disc space-y-1 pl-5">
                  {advice.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </details>
        {selected?.placeholder && (
          <div className="mt-3">
            <PlaceholderBanner />
          </div>
        )}
        {formError && (
          <div className="mt-3">
            <ErrorBox>{formError}</ErrorBox>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-medium">Your projects</h2>
        {projects === null && !loadError && <p className="text-sm text-slate-600">Loading…</p>}
        {projects?.length === 0 && (
          <p className="text-sm text-slate-600">No projects yet. Create one above.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {projects?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/projects/${p.id}`} className={`${linkClass} font-medium`}>
                {p.name}
              </Link>
              <span className="text-xs text-slate-600">
                Template: {templates.find((t) => t.id === p.template_id)?.name ?? p.template_id}
                {p.delete_after && (
                  <span className={p.delete_overdue ? "ml-2 font-medium text-rose-800" : "ml-2"}>
                    · {p.delete_overdue ? "Deletion overdue" : "Delete by"} {p.delete_after}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
