"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronRight, Clock, Hourglass, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { AddSubcontractorDialog } from "@/components/AddSubcontractorDialog";
import { ErrorBox, OverdueBanner, PlaceholderBanner } from "@/components/Banners";
import { cn } from "@/components/cn";
import { AssessRowButton } from "@/components/AssessRowButton";
import { CountPill } from "@/components/CountPill";
import { GlanceBadge } from "@/components/GlanceBadge";
import { MetricCard } from "@/components/MetricCard";
import { OverviewGrid } from "@/components/OverviewGrid";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProject, getProjectOverview, getTemplate, listDocuments, listExpiring, listOpenRequests } from "@/lib/api";
import { queryKeys } from "@/lib/queries";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const projectQ = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => getProject(projectId) });
  const project = projectQ.data;
  const templateQ = useQuery({
    queryKey: queryKeys.template(project?.template_id ?? ""),
    queryFn: () => getTemplate(project?.template_id ?? ""),
    enabled: !!project,
  });
  const template = templateQ.data;
  const expiringQ = useQuery({ queryKey: queryKeys.expiring, queryFn: listExpiring });
  const requestsQ = useQuery({ queryKey: queryKeys.openRequests, queryFn: listOpenRequests });
  const overviewQ = useQuery({ queryKey: queryKeys.overview(projectId), queryFn: () => getProjectOverview(projectId) });
  const docCounts = useQueries({
    queries: (project?.engagements ?? []).map((e) => ({
      queryKey: queryKeys.documents(e.id),
      queryFn: () => listDocuments(e.id),
    })),
  });
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const error = projectQ.error ?? templateQ.error;
  if (error) {
    return (
      <>
        <PageHeader title="Project" />
        <PageBody>
          <ErrorBox>{errorText(error)}</ErrorBox>
        </PageBody>
      </>
    );
  }
  if (!project || !template) {
    return (
      <>
        <PageHeader title="Project" />
        <PageBody>
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </PageBody>
      </>
    );
  }

  const expiring = (expiringQ.data ?? []).filter((i) => i.project_id === projectId);
  const waiting = (requestsQ.data ?? []).filter((r) => r.project_id === projectId);
  const glanceOf = new Map((overviewQ.data?.engagements ?? []).map((e) => [e.engagement_id, e]));
  const awaitingDecision = (overviewQ.data?.engagements ?? []).reduce((n, e) => n + e.awaiting_decision, 0);
  const attention = (id: string) => ({
    expiring: expiring.filter((i) => i.engagement_id === id).length,
    waiting: waiting.filter((r) => r.engagement_id === id).length,
  });

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={`Template: ${template.name} (version ${template.version}, ${template.requirements.length} requirements) · Delete data by ${project.delete_after ?? "no date set"}`}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden />
            Add subcontractor
          </Button>
        }
      />
      <PageBody>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="text-foreground">{project.name}</span>
        </nav>

        {template.placeholder && <PlaceholderBanner />}
        {project.delete_overdue && <OverdueBanner date={project.delete_after} />}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Project summary">
          <MetricCard
            icon={Hourglass}
            label="Waiting for your decision"
            value={overviewQ.data ? awaitingDecision : "—"}
            meta="Requirements with no decision yet"
          />
          <MetricCard
            icon={Upload}
            label="Waiting for a new upload"
            value={requestsQ.data ? waiting.length : "—"}
            meta="Open requests"
            href={`/issues?filter=upload&project=${projectId}`}
          />
          <MetricCard
            icon={Clock}
            label="Expired or ending soon"
            value={expiringQ.data ? expiring.length : "—"}
            meta="Document dates"
            href={`/issues?filter=expiry&project=${projectId}`}
          />
        </section>

        <Tabs defaultValue="subcontractors">
          <TabsList>
            <TabsTrigger value="subcontractors">
              Subcontractors <span className="rounded-full bg-muted px-1.5 text-xs">{project.engagements.length}</span>
            </TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="requirements">
              Requirements <span className="rounded-full bg-muted px-1.5 text-xs">{template.requirements.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="subcontractors">
            <Card>
              <CardHeader>
                <CardTitle>Subcontractors</CardTitle>
                <CardDescription>The newest is at the top. Open one to upload and review their documents.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {project.engagements.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    None yet. Choose “Add subcontractor”, then upload their documents.
                  </p>
                ) : (
                  <Table className="min-w-[36rem]">
                    <THead>
                      <Tr>
                        <Th>Company</Th>
                        <Th>Documents</Th>
                        <Th>Documentation</Th>
                        <Th>New upload</Th>
                        <Th>Close to expiry</Th>
                        <Th>
                          <span className="sr-only">Open</span>
                        </Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {project.engagements.map((e, i) => {
                        const a = attention(e.id);
                        const docs = docCounts[i]?.data?.length;
                        return (
                          <Tr
                            key={e.id}
                            onClick={() => router.push(`/engagements/${e.id}`)}
                            className={cn("cursor-pointer transition-colors hover:bg-subtle", e.id === justAdded && "bg-muted")}
                          >
                            <Td>
                              <div className="flex items-center gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                                  <Building2 className="size-4" aria-hidden />
                                </span>
                                <div className="min-w-0">
                                  <Link
                                    href={`/engagements/${e.id}`}
                                    onClick={(ev) => ev.stopPropagation()}
                                    className="font-medium underline-offset-2 hover:underline"
                                  >
                                    {e.subcontractor_name}
                                  </Link>
                                  <p className="text-xs text-muted-foreground">{e.contact_email ?? "No contact email"}</p>
                                </div>
                                {e.id === justAdded && (
                                  <span role="status" className="ml-1 inline-flex items-center gap-1 text-xs">
                                    <Check className="size-3.5" aria-hidden />
                                    Added
                                  </span>
                                )}
                              </div>
                            </Td>
                            <Td>{docs === undefined ? <span className="text-muted-foreground">…</span> : docs}</Td>
                            <Td>
                              {glanceOf.get(e.id)?.glance === "not_assessed" ? (
                                <AssessRowButton engagementId={e.id} projectId={projectId} documentCount={docs} name={e.subcontractor_name} />
                              ) : glanceOf.get(e.id) ? (
                                <GlanceBadge glance={glanceOf.get(e.id)!.glance} />
                              ) : (
                                <span className="text-muted-foreground">…</span>
                              )}
                            </Td>
                            <Td>
                              <CountPill count={a.waiting} one="waiting" many="waiting" none="None" icon={Upload} />
                            </Td>
                            <Td>
                              <CountPill count={a.expiring} one="document" many="documents" none="None" icon={Clock} />
                            </Td>
                            <Td className="text-right">
                              <ChevronRight className="inline size-4 text-muted-foreground" aria-hidden />
                            </Td>
                          </Tr>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Documentation overview</CardTitle>
                <CardDescription>
                  One row per subcontractor, one column per requirement. A tick means a person has decided it. Hover a cell
                  for details.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {overviewQ.data ? (
                  <OverviewGrid overview={overviewQ.data} />
                ) : overviewQ.error ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">{errorText(overviewQ.error)}</p>
                ) : (
                  <Skeleton className="m-4 h-24" />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requirements">
            <Card>
              <CardHeader>
                <CardTitle>Requirements in this template</CardTitle>
                <CardDescription>
                  Every subcontractor on this project is checked against these. They come from the template and can&apos;t be
                  edited here.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border text-sm">
                  {template.requirements.map((r) => (
                    <li key={r.code} className="px-4 py-2.5">
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span>{" "}
                      <span className="font-medium">{r.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.mandatory ? "" : " (optional)"}
                        {r.expires ? " · has an expiry date" : ""}
                      </span>
                      <p className="text-muted-foreground">{r.description}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageBody>
      <AddSubcontractorDialog
        projectId={projectId}
        projectName={project.name}
        open={adding}
        onOpenChange={setAdding}
        onAdded={(created) => setJustAdded(created.id)}
      />
    </>
  );
}
