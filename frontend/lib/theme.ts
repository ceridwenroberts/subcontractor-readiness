/**
 * Light, dark or system colour theme. The choice is a per-browser convenience, so it lives in
 * localStorage behind guards (it can be unavailable), and "system" follows the OS setting.
 * Screens never touch storage themselves: they call these functions (see docs/ui-handoff.md).
 */
export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];
export const THEME_LABEL: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const KEY = "readiness.theme";

export function parseTheme(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
}

export function getThemeChoice(): ThemeChoice {
  try {
    if (typeof window === "undefined") return "system";
    return parseTheme(window.localStorage.getItem(KEY));
  } catch {
    return "system";
  }
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
}

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Sets data-theme on <html>. The stylesheet reads it; "system" is resolved here. */
export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice, systemPrefersDark());
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }
  return resolved;
}
