/**
 * TanStack Query wrappers around lib/api.ts. Screens read data through these hooks instead of
 * repeating load, ignore-flag and error code. All network calls still go through api.ts.
 */
import { QueryClient, useQuery } from "@tanstack/react-query";

import {
  getEngagement,
  getProject,
  getTemplate,
  listDocuments,
  listExpiring,
  listFindings,
  listOpenRequests,
  listProjects,
  listRequestReasons,
  listTemplates,
} from "./api";

export const queryKeys = {
  templates: ["templates"] as const,
  template: (id: string) => ["templates", id] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  engagement: (id: string) => ["engagements", id] as const,
  documents: (engagementId: string) => ["engagements", engagementId, "documents"] as const,
  findings: (engagementId: string) => ["engagements", engagementId, "findings"] as const,
  openRequests: ["upload-requests", "open"] as const,
  expiring: ["issues", "expiring"] as const,
  reasons: ["upload-requests", "reasons"] as const,
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false },
    },
  });
}

export const useTemplates = () => useQuery({ queryKey: queryKeys.templates, queryFn: listTemplates });
export const useTemplate = (id: string | undefined) =>
  useQuery({ queryKey: queryKeys.template(id ?? ""), queryFn: () => getTemplate(id ?? ""), enabled: !!id });
export const useProjects = () => useQuery({ queryKey: queryKeys.projects, queryFn: listProjects });
export const useProject = (id: string) =>
  useQuery({ queryKey: queryKeys.project(id), queryFn: () => getProject(id) });
export const useEngagement = (id: string) =>
  useQuery({ queryKey: queryKeys.engagement(id), queryFn: () => getEngagement(id) });
export const useDocuments = (engagementId: string) =>
  useQuery({ queryKey: queryKeys.documents(engagementId), queryFn: () => listDocuments(engagementId) });
export const useFindings = (engagementId: string) =>
  useQuery({ queryKey: queryKeys.findings(engagementId), queryFn: () => listFindings(engagementId) });
export const useOpenRequests = () =>
  useQuery({ queryKey: queryKeys.openRequests, queryFn: listOpenRequests });
export const useRequestReasons = () =>
  useQuery({ queryKey: queryKeys.reasons, queryFn: listRequestReasons, staleTime: Infinity });
export const useExpiring = () => useQuery({ queryKey: queryKeys.expiring, queryFn: listExpiring });
