"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ErrorBox } from "@/components/Banners";
import { MetricCard } from "@/components/MetricCard";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { ProjectsTable } from "@/components/ProjectsTable";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectStats } from "@/components/useProjectStats";

export default function Home() {
  const { rows, totals, loadError } = useProjectStats();
  const [creating, setCreating] = useState(false);
  const needAttention = totals.withIssues;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="What needs your attention today."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-3.5" aria-hidden />
            New project
          </Button>
        }
      />
      <PageBody>
        {loadError && <ErrorBox>{loadError}</ErrorBox>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
          <MetricCard icon={FolderKanban} label="Projects" value={totals.projects} meta="All projects" href="/projects" />
          <MetricCard
            icon={CheckCircle2}
            label="Nothing to follow up"
            value={totals.withoutIssues}
            meta="No expiring dates, no requests"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Waiting for a new upload"
            value={totals.waiting}
            meta={`Across ${new Set(rows?.filter((r) => r.waiting > 0).map((r) => r.project.id)).size} projects`}
            href="/issues"
          />
          <MetricCard
            icon={Clock}
            label="Close to expiry"
            value={totals.expiring}
            meta="Dates that ended or end within 60 days"
            href="/issues"
          />
        </section>

        {needAttention > 0 && (
          <Alert icon={AlertTriangle} tone="alert" title={`${needAttention} project${needAttention === 1 ? "" : "s"} need${needAttention === 1 ? "s" : ""} your attention`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {totals.expiring} document date{totals.expiring === 1 ? "" : "s"} close to expiry and {totals.waiting} request
                {totals.waiting === 1 ? "" : "s"} waiting for a new upload.
              </span>
              <Link href="/issues" className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2">
                Review all issues <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Projects</CardTitle>
              <CardDescription>Open a project to add subcontractors and review their documents.</CardDescription>
            </div>
            <Link href="/projects" className="inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:text-muted-foreground">
              View all <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {rows === undefined && !loadError && <Skeleton className="m-4 h-24" />}
            {rows?.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">No projects yet. Choose “New project” to start.</p>
            )}
            {rows && rows.length > 0 && <ProjectsTable rows={rows.slice(0, 5)} />}
          </CardContent>
        </Card>
      </PageBody>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
