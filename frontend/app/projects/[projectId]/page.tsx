"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { Card, ErrorBox, OverdueBanner, PlaceholderBanner, buttonClass, inputClass, linkClass } from "@/components/ui";
import { createEngagement, getProject, getTemplate } from "@/lib/api";
import { REQUEST_TEXT } from "@/lib/labels";
import type { ProjectDetail, TemplateDetail } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    getProject(projectId)
      .then(async (p) => {
        const t = await getTemplate(p.template_id);
        if (!ignore) {
          setProject(p);
          setTemplate(t);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) setError(errorText(err));
      });
    return () => {
      ignore = true;
    };
  }, [projectId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const created = await createEngagement(projectId, name.trim(), contact.trim());
      setProject((prev) => (prev ? { ...prev, engagements: [...prev.engagements, created] } : prev));
      setName("");
      setContact("");
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!project || !template) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <main className="space-y-6">
      <p className="text-sm">
        <Link href="/" className={linkClass}>
          ← All projects
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-slate-600">
          Template: {template.name} (version {template.version}, {template.requirements.length} requirements)
        </p>
      </div>
      {template.placeholder && <PlaceholderBanner />}
      {project.delete_overdue && <OverdueBanner date={project.delete_after} />}
      {project.delete_after && !project.delete_overdue && (
        <p className="text-xs text-slate-600">Delete the data for this project by {project.delete_after}.</p>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-medium">New subcontractor</h2>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block flex-1 text-sm">
            <span className="mb-1 block font-medium">Subcontractor name (fictional)</span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
              placeholder="For example: Exempelrör AB"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{REQUEST_TEXT.contactLabel}</span>
            <input
              type="email"
              className={inputClass}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={200}
              placeholder="kontakt@exempelror.example"
            />
            <span className="mt-1 block text-xs text-slate-600">{REQUEST_TEXT.contactHelp}</span>
          </label>
          <button className={buttonClass} disabled={saving || !name.trim()}>
            {saving ? "Adding…" : "Add subcontractor"}
          </button>
        </form>
        {formError && (
          <div className="mt-3">
            <ErrorBox>{formError}</ErrorBox>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-medium">Subcontractors on this project</h2>
        {project.engagements.length === 0 && (
          <p className="text-sm text-slate-600">None yet. Add one above, then upload their documents.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {project.engagements.map((e) => (
            <li key={e.id} className="py-2">
              <Link href={`/engagements/${e.id}`} className={`${linkClass} font-medium`}>
                {e.subcontractor_name}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-medium">Requirements in this template</h2>
        <ul className="space-y-2 text-sm">
          {template.requirements.map((r) => (
            <li key={r.code}>
              <span className="font-mono text-xs text-slate-600">{r.code}</span>{" "}
              <span className="font-medium">{r.title}</span>
              {r.mandatory ? "" : " (optional)"}
              {r.expires ? " (has an expiry date)" : ""}
              <p className="text-slate-600">{r.description}</p>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
