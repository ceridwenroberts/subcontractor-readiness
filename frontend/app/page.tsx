"use client";

import { ArrowRight, Clock, Hourglass, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ErrorBox } from "@/components/Banners";
import { MetricCard } from "@/components/MetricCard";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { ProjectsTable } from "@/components/ProjectsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectStats } from "@/components/useProjectStats";

export default function Home() {
  const { rows, totals, loadError, loading } = useProjectStats();
  const num = (n: number) => (loading ? "—" : n);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Dashboard"
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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Summary">
          <MetricCard
            icon={Hourglass}
            label="Waiting for your decision"
            value={num(totals.awaiting)}
            meta="Requirements with no decision yet"
            href="/projects"
          />
          <MetricCard
            icon={Upload}
            label="Waiting for a new upload"
            value={num(totals.waiting)}
            meta={(() => {
              const n = new Set(rows?.filter((r) => r.waiting > 0).map((r) => r.project.id)).size;
              return `Across ${n} project${n === 1 ? "" : "s"}`;
            })()}
            href="/issues?filter=upload"
          />
          <MetricCard
            icon={Clock}
            label="Expired or ending soon"
            value={num(totals.expiring)}
            meta="Document dates"
            href="/issues?filter=expiry"
          />
        </section>

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
