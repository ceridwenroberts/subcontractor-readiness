"use client";

import { useEffect, useState } from "react";

import { listDemoUsers } from "@/lib/api";
import type { User } from "@/lib/schemas";
import { initSession, signInAs, signOutNow, useSession } from "@/lib/useSession";

/** Simulated sign-in in the page header. It is not real authentication. */
export function SessionBar() {
  const { user, ready } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void initSession();
    listDemoUsers()
      .then((list) => {
        setUsers(list);
        setChoice((current) => current || list[0]?.id || "");
      })
      .catch(() => setUsers([]));
  }, []);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signInAs(choice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    }
  }

  if (!ready) return <div className="h-8" aria-hidden />;

  if (user) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>
          Signed in as <strong className="text-slate-900">{user.name}</strong>
          <span className="ml-1 rounded border border-amber-300 bg-amber-50 px-1 text-amber-900">
            Simulated
          </span>
        </span>
        <button type="button" onClick={() => void signOutNow()} className="underline hover:text-slate-900">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSignIn} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <label className="flex items-center gap-1">
        Sign in as
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="rounded border border-slate-300 bg-white px-1 py-0.5 text-slate-900"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!choice}
        className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50"
      >
        Sign in
      </button>
      <span className="rounded border border-amber-300 bg-amber-50 px-1 text-amber-900">
        Simulated, not real authentication
      </span>
      {error && <span className="text-rose-800">{error}</span>}
    </form>
  );
}
