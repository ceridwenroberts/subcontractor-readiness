"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { listDemoUsers } from "@/lib/api";
import { signInSchema } from "@/lib/forms";
import type { User } from "@/lib/schemas";
import { initSession, signInAs, signOutNow, useSession } from "@/lib/useSession";

/** Simulated sign-in in the page header. It is not real authentication. */
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

  if (!ready) return <div className="h-7" aria-hidden />;

  if (user) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3.5" aria-hidden />
        <span>
          Signed in as <strong className="text-foreground">{user.name}</strong>
        </span>
        <Badge variant="dashed">Simulated</Badge>
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            void signOutNow();
            toast("Signed out.");
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSignIn} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor="sign-in-as">Sign in as</label>
      <NativeSelect
        id="sign-in-as"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="h-7 w-auto text-xs"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" size="sm" loading={busy} loadingText="Signing in…" unavailable={!choice} unavailableReason="Choose who you are signing in as.">
        Sign in
      </Button>
      <Badge variant="dashed">Simulated, not real authentication</Badge>
      {error && (
        <span role="alert" className="text-foreground">
          {error}
        </span>
      )}
    </form>
  );
}
