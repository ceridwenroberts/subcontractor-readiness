"use client";

import { Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** A SIMULATED email draft shown in a panel beside the page. Nothing is sent. */
export function EmailDraftSheet({
  heading,
  to,
  subject,
  body,
  trigger,
}: {
  heading: string;
  to: string | null;
  subject: string | null;
  body: string | null;
  trigger: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="size-3.5" aria-hidden />
          {trigger}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle>{heading}</SheetTitle>
        <SheetDescription>
          <Badge variant="dashed">Simulated</Badge> This draft is recorded so you can read it. Nothing was sent.
        </SheetDescription>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">To</dt>
            <dd>{to}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Subject</dt>
            <dd className="font-medium">{subject}</dd>
          </div>
        </dl>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-subtle p-3 font-sans text-sm">
          {body}
        </pre>
      </SheetContent>
    </Sheet>
  );
}
