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
