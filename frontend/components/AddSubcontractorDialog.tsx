"use client";

import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorBox } from "@/components/Banners";
import { TextField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createEngagement } from "@/lib/api";
import { fieldErrors, subcontractorSchema } from "@/lib/forms";
import { REQUEST_TEXT } from "@/lib/labels";
import { queryKeys } from "@/lib/queries";
import type { Engagement, ProjectDetail } from "@/lib/schemas";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export function AddSubcontractorDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
  onAdded,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (created: Engagement) => void;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

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
        toast(`Subcontractor “${created.subcontractor_name}” added.`);
        onAdded(created);
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
          <DialogTitle>Add subcontractor</DialogTitle>
          <DialogDescription>Add a company to {projectName}. Use fictional names only.</DialogDescription>
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
              <TextField field={field} label="Company name" submitted={form.state.submissionAttempts > 0}>
                {(p) => <Input {...p} maxLength={200} placeholder="For example: Exempelrör AB" autoFocus />}
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
                  loadingText="Adding…"
                  unavailable={!name.trim()}
                  unavailableReason="Enter the company name first."
                >
                  Add subcontractor
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
