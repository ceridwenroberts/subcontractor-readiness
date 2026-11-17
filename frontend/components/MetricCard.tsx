import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

export function MetricCard({
  icon: Icon,
  label,
  value,
  meta,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  meta: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className={`block font-semibold leading-tight ${typeof value === "string" ? "text-base" : "text-2xl"}`}>{value}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      {href && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
    </>
  );
  const cls = "flex items-center gap-3 rounded-xl border border-border bg-background p-3.5";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-foreground hover:bg-subtle`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
