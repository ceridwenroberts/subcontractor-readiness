/**
 * Where the simulated sign-in token is kept: this browser's localStorage, which can be
 * unavailable (private window, blocked site data), so every access is guarded.
 * Real sign-in would use an httpOnly cookie set by the backend instead.
 */
const KEY = "readiness.session";

export function getToken(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // Without storage the session lasts until the page is reloaded.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
