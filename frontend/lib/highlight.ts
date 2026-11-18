/**
 * Find a quote inside page text so the viewer can highlight it.
 *
 * Mirrors the backend's normalization (backend/app/domain/quotes.py), so a quote the
 * backend verified can be found here: soft hyphens removed, a hyphen at the end of a
 * line joined to the next line, whitespace collapsed, case ignored. The backend does the
 * verifying; this only locates the text, and returns null when it cannot.
 */
const WORD = "[\\p{L}\\p{N}_]";
const LINE_BREAK_HYPHEN = new RegExp(`(?<=${WORD})-[^\\S\\n]*\\n\\s*(?=${WORD})`, "gu");

type Normalized = { text: string; map: number[] };

/** Normalized text plus, for each normalized character, its index in the original. */
export function normalizeWithMap(original: string): Normalized {
  const removed = new Array<boolean>(original.length).fill(false);
  for (let i = 0; i < original.length; i++) if (original[i] === "­") removed[i] = true;
  for (const m of original.matchAll(LINE_BREAK_HYPHEN)) {
    for (let i = m.index; i < m.index + m[0].length; i++) removed[i] = true;
  }
  let text = "";
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < original.length; i++) {
    if (removed[i]) continue;
    const ch = original[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        text += " ";
        map.push(i);
        lastWasSpace = true;
      }
    } else {
      for (const lowered of ch.toLowerCase()) {
        text += lowered;
        map.push(i);
      }
      lastWasSpace = false;
    }
  }
  return { text, map };
}

export function normalizeQuote(quote: string): string {
  return normalizeWithMap(quote).text.trim();
}

/** [start, end) of the quote in the original page text, or null if it is not there. */
export function findQuoteRange(page: string, quote: string): [number, number] | null {
  const wanted = normalizeQuote(quote);
  if (!wanted) return null;
  const { text, map } = normalizeWithMap(page);
  const at = text.indexOf(wanted);
  if (at === -1) return null;
  return [map[at], map[at + wanted.length - 1] + 1];
}

/** Split page text around a range, for rendering. */
export function splitAround(page: string, range: [number, number] | null) {
  if (!range) return { before: page, match: "", after: "" };
  return {
    before: page.slice(0, range[0]),
    match: page.slice(range[0], range[1]),
    after: page.slice(range[1]),
  };
}

export type Mark = { range: [number, number]; active?: boolean };
export type Segment = { text: string; mark: "none" | "active" | "other" };

/**
 * Cut page text into plain and highlighted pieces for several quotes at once. The active
 * quote is placed first, so it wins where two quotes overlap. A quote that overlaps one
 * already placed is skipped, never merged, so every highlighted piece is exactly one quote.
 */
export function segmentPage(page: string, marks: Mark[]): Segment[] {
  const placed: Mark[] = [];
  const ordered = [...marks].sort((a, b) => Number(!!b.active) - Number(!!a.active) || a.range[0] - b.range[0]);
  for (const m of ordered) {
    if (!placed.some((p) => m.range[0] < p.range[1] && p.range[0] < m.range[1])) placed.push(m);
  }
  placed.sort((a, b) => a.range[0] - b.range[0]);
  const out: Segment[] = [];
  let at = 0;
  for (const m of placed) {
    if (m.range[0] > at) out.push({ text: page.slice(at, m.range[0]), mark: "none" });
    out.push({ text: page.slice(m.range[0], m.range[1]), mark: m.active ? "active" : "other" });
    at = m.range[1];
  }
  if (at < page.length) out.push({ text: page.slice(at), mark: "none" });
  return out.length ? out : [{ text: page, mark: "none" }];
}
