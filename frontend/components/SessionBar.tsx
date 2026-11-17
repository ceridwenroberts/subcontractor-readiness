"use client";

import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { listDemoUsers } from "@/lib/api";
import { signInSchema } from "@/lib/forms";
import type { User } from "@/lib/schemas";
import { initSession, signInAs, signOutNow, useSession } from "@/lib/useSession";

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** Simulated sign-in, shown as a card in the sidebar. It is not real authentication. */
export function SessionBar() {
  const { user, ready } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const parsed = signInSchema.safeParse({ userId: choice });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signInAs(choice);
      toast("Signed in (simulated).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="h-14" aria-hidden />;

  if (user) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden
        >
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate font-medium">{user.name}</p>
          <Badge variant="dashed">Simulated</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Sign out"
          onClick={() => {
            void signOutNow();
            toast("Signed out.");
          }}
        >
          <LogOut className="size-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSignIn} className="space-y-1.5 rounded-lg border border-border bg-background p-2 text-xs">
      <label htmlFor="sign-in-as" className="font-medium">
        Sign in as
      </label>
      <NativeSelect
        id="sign-in-as"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="h-7 text-xs"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </NativeSelect>
      <Button
        type="submit"
        size="sm"
        className="w-full"
        loading={busy}
        loadingText="Signing in…"
        unavailable={!choice}
        unavailableReason="Choose who you are signing in as."
      >
        Sign in
      </Button>
      <Badge variant="dashed">Simulated, not real authentication</Badge>
      {error && (
        <p role="alert" className="text-foreground">
          {error}
        </p>
      )}
    </form>
  );
}
