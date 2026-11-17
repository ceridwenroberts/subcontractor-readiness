"use client";

import { Cpu } from "lucide-react";
import * as React from "react";

import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const DevContext = React.createContext<{ on: boolean; setOn: (v: boolean) => void }>({
  on: false,
  setOn: () => {},
});
export const useDevDetails = () => React.useContext(DevContext);

/**
 * Model and development detail is hidden by default. Anything marked className="dev-only" is
 * hidden by one CSS rule while data-dev on <html> is "off". The provider chip and the Simulated notice
 * are never marked dev-only: product rules say they stay visible.
 */
export function DevDetailsProvider({ children }: { children: React.ReactNode }) {
  const [on, setOn] = React.useState(false);
  // The attribute goes on <html> (not on a wrapper) so panels that React renders into the page
  // body, such as the review drawer, are covered by the same CSS rule.
  React.useEffect(() => {
    document.documentElement.dataset.dev = on ? "on" : "off";
  }, [on]);
  return <DevContext.Provider value={{ on, setOn }}>{children}</DevContext.Provider>;
}

export function DevToggle() {
  const { on, setOn } = useDevDetails();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="dev-surface flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium">
          <Cpu className="size-3.5" aria-hidden />
          Model details
          <Switch className="ml-auto" checked={on} onCheckedChange={setOn} aria-label="Show model and development details" />
        </label>
      </TooltipTrigger>
      <TooltipContent>
        Shows how each result was made: the AI model, the automatic checks and the prompt version.
      </TooltipContent>
    </Tooltip>
  );
}
