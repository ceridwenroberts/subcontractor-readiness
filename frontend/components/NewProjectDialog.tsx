"use client";

import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorBox } from "@/components/Banners";
import { TextField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { createProject, getRetentionAdvice, listTemplates } from "@/lib/api";
import { fieldErrors, projectSchema } from "@/lib/forms";
import { RETENTION_TEXT } from "@/lib/labels";
import { queryKeys } from "@/lib/queries";
import type { Project } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");
const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const templatesQ = useQuery({ queryKey: queryKeys.templates, queryFn: listTemplates });
  const adviceQ = useQuery({ queryKey: ["retention"], queryFn: getRetentionAdvice });
  const templates = templatesQ.data ?? [];
  const advice = adviceQ.data;
  const [formError, setFormError] = useState<string | null>(null);

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
        onOpenChange(false);
      } catch (err) {
        setFormError(errorText(err));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div>
          <DialogTitle>Create new project</DialogTitle>
          <DialogDescription>Choose a requirement template and when the data should be deleted.</DialogDescription>
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
          className="space-y-3"
        >
          <form.Field name="name">
            {(field) => (
              <TextField field={field} label="Project name" submitted={form.state.submissionAttempts > 0}>
                {(p) => <Input {...p} maxLength={200} placeholder="For example: Harbour Building 4" autoFocus />}
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
              <TextField
                field={field}
                label={RETENTION_TEXT.label}
                help="A suggestion is filled in. Nothing is deleted automatically in this version."
                submitted={form.state.submissionAttempts > 0}
              >
                {(p) => <Input {...p} type="date" value={p.value || advice?.suggested_date || ""} />}
              </TextField>
            )}
          </form.Field>
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
          {formError && <ErrorBox>{formError}</ErrorBox>}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(s) => ({ submitting: s.isSubmitting, name: s.values.name })}>
              {({ submitting, name }) => (
                <Button
                  type="submit"
                  loading={submitting}
                  loadingText="Creating…"
                  unavailable={!name.trim()}
                  unavailableReason="Enter a project name first."
                >
                  Create project
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
