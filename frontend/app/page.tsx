"use client";

import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorBox, PlaceholderBanner } from "@/components/Banners";
import { TextField } from "@/components/FormField";
import { ExpiringList, OpenRequestsTable } from "@/components/IssuesPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  API_URL,
  createProject,
  getHealth,
  getRetentionAdvice,
  listExpiring,
  listOpenRequests,
  listProjects,
  listTemplates,
} from "@/lib/api";
import { fieldErrors, projectSchema } from "@/lib/forms";
import { RETENTION_TEXT, REQUEST_TEXT } from "@/lib/labels";
import { queryKeys } from "@/lib/queries";
import type { Project } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");
const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function Home() {
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth, retry: 0 });
  const projectsQ = useQuery({ queryKey: queryKeys.projects, queryFn: listProjects, enabled: health.isSuccess });
  const templatesQ = useQuery({ queryKey: queryKeys.templates, queryFn: listTemplates, enabled: health.isSuccess });
  const adviceQ = useQuery({ queryKey: ["retention"], queryFn: getRetentionAdvice, enabled: health.isSuccess });
  const requestsQ = useQuery({ queryKey: queryKeys.openRequests, queryFn: listOpenRequests, enabled: health.isSuccess });
  const expiringQ = useQuery({ queryKey: queryKeys.expiring, queryFn: listExpiring, enabled: health.isSuccess });

  const projects = projectsQ.data;
  const templates = templatesQ.data ?? [];
  const advice = adviceQ.data;
  const openRequests = requestsQ.data ?? [];
  const expiring = expiringQ.data ?? [];
  const [formError, setFormError] = useState<string | null>(null);

  const loadError = health.error
    ? `Cannot reach the backend at ${API_URL}. Check that it is running, then reload. (${errorText(health.error)})`
    : null;

  const form = useForm({
    defaultValues: { name: "", templateId: "", deleteAfter: "" },
    validators: {
      onChange: ({ value }) => {
        const r = projectSchema(todayIso()).safeParse({ ...value, templateId: value.templateId || templates[0]?.id || "" });
        return r.success ? undefined : { fields: fieldErrors<string>(r.error) };
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setFormError(null);
      try {
        const created = await createProject(
          value.name.trim(),
          value.templateId || templates[0]?.id || "",
          value.deleteAfter || advice?.suggested_date,
        );
        queryClient.setQueryData<Project[]>(queryKeys.projects, (prev) => [created, ...(prev ?? [])]);
        toast(`Project “${created.name}” created.`);
        formApi.reset();
      } catch (err) {
        setFormError(errorText(err));
      }
    },
  });

  return (
    <main className="space-y-5">
      <h1 className="text-xl font-semibold">Projects</h1>
      {loadError && <ErrorBox>{loadError}</ErrorBox>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Issues
            {expiring.length + openRequests.length > 0 && <Badge>{expiring.length + openRequests.length}</Badge>}
          </CardTitle>
          <CardDescription>
            Documents whose date is close to running out, and requests waiting for a new upload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section aria-labelledby="expiring-heading">
            <h3 id="expiring-heading" className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              Documents close to expiry
              {expiring.length > 0 && <Badge variant="muted">{expiring.length}</Badge>}
            </h3>
            {expiringQ.isPending && health.isSuccess ? <Skeleton className="h-10 w-full" /> : <ExpiringList items={expiring} />}
            <p className="mt-1 text-xs text-muted-foreground">
              Based on the dates the assessment read from the documents. Reminder drafts are simulated: nothing is sent.
            </p>
          </section>
          <section aria-labelledby="requests-heading" className="border-t border-border pt-3">
            <h3 id="requests-heading" className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {REQUEST_TEXT.dashboardTitle}
              {openRequests.length > 0 && <Badge variant="muted">{openRequests.length}</Badge>}
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">{REQUEST_TEXT.dashboardHelp}</p>
            <OpenRequestsTable requests={openRequests} />
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
            className="grid gap-3 sm:grid-cols-[1fr_11rem_10rem_auto] sm:items-start"
          >
            <form.Field name="name">
              {(field) => (
                <TextField field={field} label="Project name" submitted={form.state.submissionAttempts > 0}>
                  {(p) => <Input {...p} maxLength={200} placeholder="For example: Harbour Building 4" />}
                </TextField>
              )}
            </form.Field>
            <form.Field name="templateId">
              {(field) => (
                <TextField field={field} label="Template" submitted={form.state.submissionAttempts > 0}>
                  {(p) => (
                    <NativeSelect {...p} value={p.value || templates[0]?.id || ""}>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </TextField>
              )}
            </form.Field>
            <form.Field name="deleteAfter">
              {(field) => (
                <TextField field={field} label={RETENTION_TEXT.label} submitted={form.state.submissionAttempts > 0}>
                  {(p) => <Input {...p} type="date" value={p.value || advice?.suggested_date || ""} />}
                </TextField>
              )}
            </form.Field>
            <form.Subscribe selector={(s) => ({ submitting: s.isSubmitting, name: s.values.name, errors: s.errors })}>
              {({ submitting, name }) => (
                <Button
                  type="submit"
                  className="sm:mt-[1.4rem]"
                  loading={submitting}
                  loadingText="Creating…"
                  unavailable={!name.trim()}
                  unavailableReason="Enter a project name first."
                >
                  Create project
                </Button>
              )}
            </form.Subscribe>
          </form>
          <details className="text-sm">
            <summary className="select-none text-xs text-muted-foreground hover:text-foreground">
              About the deletion date
            </summary>
            <div className="mt-2 space-y-2 rounded-md border border-border bg-subtle p-3 text-xs">
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
          <form.Subscribe selector={(s) => s.values.templateId}>
            {(id) => (templates.find((t) => t.id === (id || templates[0]?.id))?.placeholder ? <PlaceholderBanner /> : null)}
          </form.Subscribe>
          {formError && <ErrorBox>{formError}</ErrorBox>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your projects</CardTitle>
        </CardHeader>
        <CardContent>
          {projects === undefined && !loadError && <Skeleton className="h-10 w-full" />}
          {projects?.length === 0 && <p className="text-sm text-muted-foreground">No projects yet. Create one above.</p>}
          <ul className="divide-y divide-border">
            {projects?.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/projects/${p.id}`} className="font-medium underline-offset-2 hover:underline">
                  {p.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  Template: {templates.find((t) => t.id === p.template_id)?.name ?? p.template_id}
                  {p.delete_after && (
                    <span className={p.delete_overdue ? "ml-2 font-semibold text-foreground" : "ml-2"}>
                      · {p.delete_overdue ? "Deletion overdue" : "Delete by"} {p.delete_after}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
