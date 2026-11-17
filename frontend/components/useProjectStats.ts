"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import { API_URL, getHealth, getProject, listExpiring, listOpenRequests, listProjects, listTemplates } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { ExpiringItem, OpenRequest, Project } from "@/lib/schemas";

export type ProjectRow = {
  project: Project;
  templateName: string;
  subcontractors: number | null; // null while loading
  waiting: number; // open requests for a new upload
  expiring: number; // dates that ended or are close to ending
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

/** Everything the dashboard and the project list show, built from the existing endpoints. */
export function useProjectStats() {
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth, retry: 0 });
  const ready = health.isSuccess;
  const projectsQ = useQuery({ queryKey: queryKeys.projects, queryFn: listProjects, enabled: ready });
  const templatesQ = useQuery({ queryKey: queryKeys.templates, queryFn: listTemplates, enabled: ready });
  const requestsQ = useQuery({ queryKey: queryKeys.openRequests, queryFn: listOpenRequests, enabled: ready });
  const expiringQ = useQuery({ queryKey: queryKeys.expiring, queryFn: listExpiring, enabled: ready });
  const projects = projectsQ.data;
  const details = useQueries({
    queries: (projects ?? []).map((p) => ({
      queryKey: queryKeys.project(p.id),
      queryFn: () => getProject(p.id),
    })),
  });

  const requests: OpenRequest[] = requestsQ.data ?? [];
  const expiring: ExpiringItem[] = expiringQ.data ?? [];
  const templates = templatesQ.data ?? [];

  const rows: ProjectRow[] | undefined = projects?.map((project, i) => ({
    project,
    templateName: templates.find((t) => t.id === project.template_id)?.name ?? project.template_id,
    subcontractors: details[i]?.data ? details[i].data.engagements.length : null,
    waiting: requests.filter((r) => r.project_id === project.id).length,
    expiring: expiring.filter((e) => e.project_id === project.id).length,
  }));

  const withIssues = rows?.filter((r) => r.waiting + r.expiring > 0).length ?? 0;
  const loadError = health.error
    ? `Cannot reach the backend at ${API_URL}. Check that it is running, then reload. (${errorText(health.error)})`
    : null;

  return {
    rows,
    requests,
    expiring,
    templates,
    loadError,
    totals: {
      projects: rows?.length ?? 0,
      withoutIssues: (rows?.length ?? 0) - withIssues,
      withIssues,
      waiting: requests.length,
      expiring: expiring.length,
    },
  };
}
