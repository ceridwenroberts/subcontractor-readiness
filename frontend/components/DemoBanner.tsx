import { FlaskConical } from "lucide-react";
import Link from "next/link";

/** A thin notice at the top of every page. It stays visible: this is a demo build, not a product. */
export function DemoBanner() {
  return (
    <div role="note" className="border-b border-border bg-muted px-4 py-1.5 text-xs lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-0.5">
        <FlaskConical className="size-3.5 shrink-0" aria-hidden />
        <span>
          <strong>Demo build.</strong> Fictional data only. Sign-in and emails are simulated, the requirements are a
          placeholder, and nothing here is legal advice.
        </span>
        <Link href="/about" className="font-medium underline underline-offset-2 hover:text-muted-foreground">
          Read all limits and warnings
        </Link>
      </div>
    </div>
  );
}
