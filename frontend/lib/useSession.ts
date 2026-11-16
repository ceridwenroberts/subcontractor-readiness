import { useSyncExternalStore } from "react";

import { getMe, signIn, signOut } from "./api";
import type { User } from "./schemas";
import { clearToken, getToken, setToken } from "./token";

type State = { user: User | null; ready: boolean };

const SERVER_STATE: State = { user: null, ready: false };
let state: State = SERVER_STATE;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in demo user, shared by every component. Simulated: see lib/token.ts. */
export function useSession(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

/** Check a stored token with the backend. An unknown token (for example after a restart) is dropped. */
export async function initSession(): Promise<void> {
  if (!getToken()) {
    set({ user: null, ready: true });
    return;
  }
  try {
    set({ user: await getMe(), ready: true });
  } catch {
    clearToken();
    set({ user: null, ready: true });
  }
}

export async function signInAs(userId: string): Promise<void> {
  const result = await signIn(userId);
  setToken(result.token);
  set({ user: result.user, ready: true });
}

export async function signOutNow(): Promise<void> {
  try {
    await signOut();
  } catch {
    // the local sign-out below still happens
  }
  clearToken();
  set({ user: null, ready: true });
}
