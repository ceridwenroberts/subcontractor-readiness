"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, ErrorBox, PlaceholderBanner, buttonClass, inputClass, linkClass } from "@/components/ui";
import { API_URL, createProject, getHealth, listProjects, listTemplates } from "@/lib/api";
import type { Project, TemplateSummary } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function Home() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    Promise.all([getHealth(), listProjects(), listTemplates()])
      .then(([, p, t]) => {
        if (ignore) return;
        setProjects(p);
        setTemplates(t);
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
      const created = await createProject(name.trim(), templateId);
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
        <h2 className="mb-3 text-lg font-medium">New project</h2>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
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
          <button className={buttonClass} disabled={saving || !name.trim() || !templateId}>
            {saving ? "Creating…" : "Create project"}
          </button>
        </form>
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
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
