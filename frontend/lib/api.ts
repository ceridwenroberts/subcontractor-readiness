/**
 * The only place the frontend talks to the backend.
 * Every response is checked with a zod schema before the UI sees it.
 */
import { z } from "zod";

// NEXT_PUBLIC_ values are compiled into browser JavaScript: never put a secret here.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const HealthSchema = z.object({ status: z.literal("ok") });
export type Health = z.infer<typeof HealthSchema>;

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`${path}: HTTP ${res.status}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`${path}: response is not JSON`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`${path}: unexpected response shape`);
  }
  return parsed.data;
}

export function getHealth(): Promise<Health> {
  return getJson("/health", HealthSchema);
}
