"use client";

import { useEffect, useState } from "react";

import { API_URL, getHealth } from "@/lib/api";

type BackendState =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export default function Home() {
  const [backend, setBackend] = useState<BackendState>({ kind: "loading" });

  useEffect(() => {
    // Runs in the browser, so this request also exercises the backend's CORS rule.
    // `ignore` drops a result that arrives after this effect was cleaned up.
    let ignore = false;
    getHealth()
      .then(() => {
        if (!ignore) setBackend({ kind: "ok" });
      })
      .catch((err: unknown) => {
        if (!ignore)
          setBackend({
            kind: "error",
            message: err instanceof Error ? err.message : "unknown error",
          });
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Subcontractor readiness</h1>
      <p className="mt-4">
        Backend ({API_URL}):{" "}
        {backend.kind === "loading" && <span>checking…</span>}
        {backend.kind === "ok" && <span className="text-green-700">ok</span>}
        {backend.kind === "error" && (
          <span className="text-red-700">unreachable ({backend.message})</span>
        )}
      </p>
    </main>
  );
}
