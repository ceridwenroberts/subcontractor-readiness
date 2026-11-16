"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { THEME_LABEL, type ThemeChoice } from "@/lib/theme";

const ORDER: ThemeChoice[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** One button that cycles system, light and dark. */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  const Icon = ICON[choice];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setChoice(next)}
          aria-label={`Theme: ${THEME_LABEL[choice]}. Switch to ${THEME_LABEL[next]}.`}
        >
          <Icon className="size-3.5" aria-hidden />
          {THEME_LABEL[choice]}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Theme: {THEME_LABEL[choice]}. Click for {THEME_LABEL[next]}.</TooltipContent>
    </Tooltip>
  );
}
