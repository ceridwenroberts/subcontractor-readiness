"use client";

import { Plus, Search } from "lucide-react";
import { useState } from "react";

import { ErrorBox } from "@/components/Banners";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { ProjectsTable } from "@/components/ProjectsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectStats } from "@/components/useProjectStats";

export default function ProjectsPage() {
  const { rows, loadError } = useProjectStats();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const shown = rows?.filter((r) => r.project.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={rows ? `${rows.length} project${rows.length === 1 ? "" : "s"}` : "Manage projects and their documentation."}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-3.5" aria-hidden />
            New project
          </Button>
        }
      />
      <PageBody>
        {loadError && <ErrorBox>{loadError}</ErrorBox>}
        <Card>
          <div className="border-b border-border p-3">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" aria-hidden />
              <Input
                aria-label="Search projects"
                placeholder="Search projects…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <CardContent className="p-0">
            {rows === undefined && !loadError && <Skeleton className="m-4 h-24" />}
            {shown?.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                {rows?.length ? "No project matches your search." : "No projects yet. Choose “New project” to start."}
              </p>
            )}
            {shown && shown.length > 0 && <ProjectsTable rows={shown} />}
          </CardContent>
        </Card>
      </PageBody>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
