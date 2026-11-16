import { WHO, WHO_TEXT } from "@/lib/labels";
import type { Finding } from "@/lib/schemas";
import { usedVerifier } from "@/lib/provenance";

type Part = keyof typeof WHO;

function Tag({ part }: { part: Part }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${WHO[part].color}`}>
      {WHO[part].tag}
    </span>
  );
}

/** Explains, above the findings, which parts come from an AI model and which do not. */
export function HowItWasMade({ findings }: { findings: Finding[] }) {
  const first = findings[0];
  if (!first) return null;
  const simulated = first.provider === "scripted";
  const verifier = usedVerifier(findings);
  const parts: { part: Part; text: string; detail?: string }[] = [
    {
      part: "model",
      text: WHO_TEXT.model,
      detail: `${first.provider_label}: ${first.model}`,
    },
    { part: "code", text: WHO_TEXT.code },
    ...(verifier ? [{ part: "verifier" as const, text: WHO_TEXT.verifier }] : []),
    { part: "person", text: WHO_TEXT.person },
  ];
  return (
    <div className="space-y-2">
      {simulated && (
        <div role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {WHO_TEXT.scripted}
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-medium">How each finding is made</h3>
        <ol className="grid gap-3 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
          {parts.map((p, i) => (
            <li key={p.part} className="space-y-1">
              <span className="mr-1 text-slate-500">{i + 1}.</span>
              <Tag part={p.part} />
              {p.detail && <p className="font-medium text-slate-900">{p.detail}</p>}
              <p>{p.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-slate-500">Prompt version: {first.prompt_version}</p>
      </div>
    </div>
  );
}
