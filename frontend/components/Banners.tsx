import { CalendarClock, ShieldAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { PLACEHOLDER_BANNER, RETENTION_TEXT } from "@/lib/labels";

export function PlaceholderBanner() {
  return <Alert icon={ShieldAlert}>{PLACEHOLDER_BANNER}</Alert>;
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return <Alert tone="alert">{children}</Alert>;
}

export function OverdueBanner({ date }: { date: string | null }) {
  return (
    <Alert tone="alert" icon={CalendarClock}>
      {RETENTION_TEXT.overdue}
      {date ? ` (Date set: ${date}.)` : ""}
    </Alert>
  );
}
