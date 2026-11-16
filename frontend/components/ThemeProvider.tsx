"use client";

import * as React from "react";

import {
  applyTheme,
  getThemeChoice,
  resolveTheme,
  setThemeChoice,
  systemPrefersDark,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  media?.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    media?.removeEventListener("change", cb);
  };
};

type ThemeValue = { choice: ThemeChoice; resolved: ResolvedTheme; setChoice: (c: ThemeChoice) => void };
const ThemeContext = React.createContext<ThemeValue>({
  choice: "system",
  resolved: "light",
  setChoice: () => {},
});

export const useTheme = () => React.useContext(ThemeContext);

/** Holds the light / dark / system choice (stored through lib/theme.ts) and sets data-theme on <html>. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const choice = React.useSyncExternalStore(subscribe, getThemeChoice, () => "system" as ThemeChoice);
  const dark = React.useSyncExternalStore(subscribe, systemPrefersDark, () => false);
  const resolved = resolveTheme(choice, dark);

  React.useEffect(() => {
    applyTheme(choice);
  }, [choice, dark]);

  const setChoice = React.useCallback((c: ThemeChoice) => {
    setThemeChoice(c);
    listeners.forEach((l) => l());
  }, []);

  return <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>;
}
