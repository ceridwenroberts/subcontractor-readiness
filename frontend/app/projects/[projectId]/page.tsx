"use client";

import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";

import { ErrorBox, OverdueBanner, PlaceholderBanner } from "@/components/Banners";
import { cn } from "@/components/cn";
import { TextField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createEngagement, getProject, getTemplate } from "@/lib/api";
import { fieldErrors, subcontractorSchema } from "@/lib/forms";
import { REQUEST_TEXT } from "@/lib/labels";
import { queryKeys } from "@/lib/queries";
import type { ProjectDetail } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const queryClient = useQueryClient();
  const projectQ = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => getProject(projectId) });
  const project = projectQ.data;
  const templateQ = useQuery({
    queryKey: queryKeys.template(project?.template_id ?? ""),
    queryFn: () => getTemplate(project?.template_id ?? ""),
    enabled: !!project,
  });
  const template = templateQ.data;
  const [formError, setFormError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", contactEmail: "" },
    validators: {
      onChange: ({ value }) => {
        const r = subcontractorSchema.safeParse(value);
        return r.success ? undefined : { fields: fieldErrors<string>(r.error) };
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setFormError(null);
      try {
        const created = await createEngagement(projectId, value.name.trim(), value.contactEmail.trim());
        queryClient.setQueryData<ProjectDetail>(queryKeys.project(projectId), (prev) =>
          prev ? { ...prev, engagements: [created, ...prev.engagements] } : prev,
        );
        setJustAdded(created.id);
        toast(`Subcontractor “${created.subcontractor_name}” added.`);
        formApi.reset();
      } catch (err) {
        setFormError(errorText(err));
      }
    },
  });

  const error = projectQ.error ?? templateQ.error;
  if (error) return <ErrorBox>{errorText(error)}</ErrorBox>;
  if (!project || !template) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <main className="space-y-5">
      <Link href="/" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" aria-hidden />
        All projects
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <p className="text-xs text-muted-foreground">
          Template: {template.name} (version {template.version}, {template.requirements.length} requirements)
        </p>
      </div>
      {template.placeholder && <PlaceholderBanner />}
      {project.delete_overdue && <OverdueBanner date={project.delete_after} />}
      {project.delete_after && !project.delete_overdue && (
        <p className="text-xs text-muted-foreground">Delete the data for this project by {project.delete_after}.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Subcontractors on this project ({project.engagements.length})</CardTitle>
          <CardDescription>The newest is at the top. Open one to upload their documents.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
          >
            <form.Field name="name">
              {(field) => (
                <TextField
                  field={field}
                  label="New subcontractor (fictional name)"
                  submitted={form.state.submissionAttempts > 0}
                >
                  {(p) => <Input {...p} maxLength={200} placeholder="For example: Exempelrör AB" />}
                </TextField>
              )}
            </form.Field>
            <form.Field name="contactEmail">
              {(field) => (
                <TextField
                  field={field}
                  label={REQUEST_TEXT.contactLabel}
                  help={REQUEST_TEXT.contactHelp}
                  submitted={form.state.submissionAttempts > 0}
                >
                  {(p) => <Input {...p} type="email" maxLength={200} placeholder="kontakt@exempelror.example" />}
                </TextField>
              )}
            </form.Field>
            <form.Subscribe selector={(s) => ({ submitting: s.isSubmitting, name: s.values.name })}>
              {({ submitting, name }) => (
                <Button
                  type="submit"
                  className="sm:mt-[1.4rem]"
                  loading={submitting}
                  loadingText="Adding…"
                  unavailable={!name.trim()}
                  unavailableReason="Enter the subcontractor's name first."
                >
                  Add subcontractor
                </Button>
              )}
            </form.Subscribe>
          </form>
          {formError && <ErrorBox>{formError}</ErrorBox>}

          {project.engagements.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. Add one above, then upload their documents.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {project.engagements.map((e) => (
                <li
                  key={e.id}
                  className={cn("flex items-center justify-between gap-2 px-3 py-2", e.id === justAdded && "bg-muted")}
                >
                  <Link href={`/engagements/${e.id}`} className="font-medium underline-offset-2 hover:underline">
                    {e.subcontractor_name}
                  </Link>
                  {e.id === justAdded && (
                    <span role="status" className="inline-flex items-center gap-1 text-xs">
                      <Check className="size-3.5" aria-hidden />
                      Added
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requirements in this template</CardTitle>
          <CardDescription>
            These are the documents every subcontractor on this project is checked against. They come from the
            template and can&apos;t be edited here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {template.requirements.map((r) => (
              <li key={r.code} className="py-2">
                <span className="font-mono text-xs text-muted-foreground">{r.code}</span>{" "}
                <span className="font-medium">{r.title}</span>
                <span className="text-xs text-muted-foreground">
                  {r.mandatory ? "" : " (optional)"}
                  {r.expires ? " · has an expiry date" : ""}
                </span>
                <p className="text-muted-foreground">{r.description}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
