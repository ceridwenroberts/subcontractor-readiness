"use client";

import { Building2, ChevronRight, Clock, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CountPill } from "@/components/CountPill";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import type { ProjectRow } from "@/components/useProjectStats";

/** Projects with what needs attention in each. A row opens the project. */
export function ProjectsTable({ rows }: { rows: ProjectRow[] }) {
  const router = useRouter();
  return (
    <Table className="min-w-[44rem]">
      <THead>
        <Tr>
          <Th>Project</Th>
          <Th>Subcontractors</Th>
          <Th>New upload</Th>
          <Th>Close to expiry</Th>
          <Th>Delete data by</Th>
          <Th>
            <span className="sr-only">Open</span>
          </Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map(({ project, templateName, subcontractors, waiting, expiring }) => (
          <Tr
            key={project.id}
            onClick={() => router.push(`/projects/${project.id}`)}
            className="cursor-pointer transition-colors hover:bg-subtle"
          >
            <Td>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                  <Building2 className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/projects/${project.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {project.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">Template: {templateName}</p>
                </div>
              </div>
            </Td>
            <Td>{subcontractors === null ? <span className="text-muted-foreground">…</span> : subcontractors}</Td>
            <Td>
              <CountPill count={waiting} one="waiting" many="waiting" none="None" icon={Upload} />
            </Td>
            <Td>
              <CountPill count={expiring} one="document" many="documents" none="None" icon={Clock} />
            </Td>
            <Td className="whitespace-nowrap text-xs">
              {project.delete_after ? (
                <span className={project.delete_overdue ? "font-semibold" : ""}>
                  {project.delete_overdue ? "Overdue · " : ""}
                  {project.delete_after}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Td>
            <Td className="text-right">
              <ChevronRight className="inline size-4 text-muted-foreground" aria-hidden />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
