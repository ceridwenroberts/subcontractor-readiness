import { Badge } from "@/components/ui/badge";
import { WHO, WHO_TEXT } from "@/lib/labels";
import { usedVerifier } from "@/lib/provenance";
import type { Finding } from "@/lib/schemas";

type Part = keyof typeof WHO;

/**
 * Explains which parts come from an AI model and which do not. The Simulated notice is always
 * visible. The rest is model and development detail, hidden unless the header switch is on.
 * The steps are a single column so the note fits a narrow side card as well as a wide one.
 */
export function HowItWasMade({ findings }: { findings: Finding[] }) {
  // A requirement with no document has no model behind it, so it cannot name the provider.
  const first = findings.find((f) => f.provider !== "none") ?? findings[0];
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
        <p role="note" className="dev-surface break-words rounded-md border px-3 py-1.5">
          {WHO_TEXT.scripted}
        </p>
      )}
      <details className="dev-only">
        <summary className="dev-ink cursor-pointer select-none">
          About these results: {first.provider_label}
          {!simulated && ` (${first.model})`}
        </summary>
        <div className="dev-surface mt-2 rounded-md border p-3 text-foreground">
          <ol className="space-y-3">
            {parts.map((p, i) => (
              <li key={p.part} className="flex gap-2">
                <span className="w-4 shrink-0 text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 space-y-1">
                  <Badge variant="model">{WHO[p.part].tag}</Badge>
                  {p.detail && <p className="break-words font-medium">{p.detail}</p>}
                  <p className="break-words">{p.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 break-words border-t border-border pt-2 text-muted-foreground">
            Prompt version: {first.prompt_version}
          </p>
        </div>
      </details>
    </div>
  );
}
