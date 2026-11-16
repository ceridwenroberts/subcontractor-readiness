import { WHO_TEXT } from "@/lib/labels";
import { WHO } from "@/lib/labels";
import { usedVerifier } from "@/lib/provenance";
import type { Finding } from "@/lib/schemas";

import { Badge } from "@/components/ui/badge";

type Part = keyof typeof WHO;

/**
 * Explains which parts come from an AI model and which do not. The Simulated notice is always
 * visible. The rest is model and development detail, hidden unless the header switch is on.
 */
export function HowItWasMade({ findings }: { findings: Finding[] }) {
  const first = findings[0];
  if (!first) return null;
  const simulated = first.provider === "scripted";
  const verifier = usedVerifier(findings);
  const parts: { part: Part; text: string; detail?: string }[] = [
    { part: "model", text: WHO_TEXT.model, detail: `${first.provider_label}: ${first.model}` },
    { part: "code", text: WHO_TEXT.code },
    ...(verifier ? [{ part: "verifier" as const, text: WHO_TEXT.verifier }] : []),
    { part: "person", text: WHO_TEXT.person },
  ];
  return (
    <div className="space-y-2 text-xs">
      {simulated && (
        <p role="note" className="dev-surface rounded-md border px-3 py-1.5">
          {WHO_TEXT.scripted}
        </p>
      )}
      <details className="dev-only">
        <summary className="dev-ink select-none">
          About these results: {first.provider_label}
          {!simulated && ` (${first.model})`}
        </summary>
        <div className="dev-surface mt-2 rounded-md border p-3 text-foreground">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {parts.map((p, i) => (
              <li key={p.part} className="space-y-1">
                <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                <Badge variant="model">{WHO[p.part].tag}</Badge>
                {p.detail && <p className="font-medium">{p.detail}</p>}
                <p>{p.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-muted-foreground">Prompt version: {first.prompt_version}</p>
        </div>
      </details>
    </div>
  );
}
