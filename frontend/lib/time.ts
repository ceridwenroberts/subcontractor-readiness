/**
 * The backend stores UTC, but SQLite returns timestamps without a zone ("2026-11-16T14:54:26").
 * Without a zone the browser would read them as local time and show the wrong hour.
 */
export function parseUtc(iso: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

export const formatWhen = (iso: string) => parseUtc(iso).toLocaleString();
