"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { type AssessProgress, assessEngagementStream } from "@/lib/api";
import { queryKeys } from "@/lib/queries";

export type AssessRun = {
  engagementId: string;
  projectId: string;
  name: string;
  progress: AssessProgress | null;
};

type Ctx = {
  runs: Record<string, AssessRun>;
  errors: Record<string, string>;
  start: (run: Omit<AssessRun, "progress">) => void;
};

const AssessmentContext = React.createContext<Ctx>({ runs: {}, errors: {}, start: () => {} });
export const useAssessments = () => React.useContext(AssessmentContext);

function omit<T>(obj: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : "The assessment could not be completed.");

/**
 * Keeps a running assessment alive while the person moves between pages, so leaving the
 * subcontractor page does not lose it. Reloading or closing the tab still stops it, so the
 * browser is asked to confirm while one is running. Nothing is saved until all requirements are
 * done (the backend rule), so a stopped run saves nothing.
 */
export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [runs, setRuns] = React.useState<Record<string, AssessRun>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const running = React.useRef(new Set<string>());

  const start = React.useCallback(
    (run: Omit<AssessRun, "progress">) => {
      if (running.current.has(run.engagementId)) return;
      running.current.add(run.engagementId);
      setErrors((prev) => omit(prev, run.engagementId));
      setRuns((prev) => ({ ...prev, [run.engagementId]: { ...run, progress: null } }));
      void (async () => {
        try {
          const result = await assessEngagementStream(run.engagementId, (progress) =>
            setRuns((prev) => (prev[run.engagementId] ? { ...prev, [run.engagementId]: { ...prev[run.engagementId], progress } } : prev)),
          );
          queryClient.setQueryData(queryKeys.findings(run.engagementId), result);
          void queryClient.invalidateQueries({ queryKey: queryKeys.openRequests });
          void queryClient.invalidateQueries({ queryKey: queryKeys.expiring });
          void queryClient.invalidateQueries({ queryKey: ["decisions"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.overview(run.projectId) });
          toast(`Assessment finished for ${run.name}: ${result.length} requirements checked.`);
        } catch (err) {
          setErrors((prev) => ({ ...prev, [run.engagementId]: errorText(err) }));
          toast(`The assessment for ${run.name} did not finish. Nothing was saved.`);
        } finally {
          running.current.delete(run.engagementId);
          setRuns((prev) => omit(prev, run.engagementId));
        }
      })();
    },
    [queryClient],
  );

  const active = Object.keys(runs).length > 0;
  React.useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const value = React.useMemo(() => ({ runs, errors, start }), [runs, errors, start]);
  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}
