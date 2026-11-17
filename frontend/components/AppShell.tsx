"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FolderKanban, Home, Info, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { cn } from "@/components/cn";
import { DemoBanner } from "@/components/DemoBanner";
import { DevToggle } from "@/components/DevDetails";
import { SessionBar } from "@/components/SessionBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { listExpiring, listOpenRequests } from "@/lib/api";
import { queryKeys } from "@/lib/queries";

const ShellContext = React.createContext<{ openMenu: () => void }>({ openMenu: () => {} });
export const useShell = () => React.useContext(ShellContext);

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/issues", label: "Issues", icon: AlertTriangle },
  { href: "/about", label: "About this demo", icon: Info },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/projects") return pathname.startsWith("/projects") || pathname.startsWith("/engagements") || pathname.startsWith("/documents");
  return pathname.startsWith(href);
}

/** Left navigation on wide screens, a slide-over menu on narrow ones. */
function NavLinks({ issueCount, onNavigate }: { issueCount: number; onNavigate: () => void }) {
  // usePathname depends on the request, so this part is rendered inside a Suspense boundary.
  const pathname = usePathname();
  return (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
              active ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {href === "/issues" && issueCount > 0 && <Badge className="ml-auto">{issueCount}</Badge>}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const expiring = useQuery({ queryKey: queryKeys.expiring, queryFn: listExpiring, retry: 0 });
  const requests = useQuery({ queryKey: queryKeys.openRequests, queryFn: listOpenRequests, retry: 0 });
  const issueCount = (expiring.data?.length ?? 0) + (requests.data?.length ?? 0);

  return (
    <ShellContext.Provider value={{ openMenu: () => setOpen(true) }}>
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[15rem_minmax(0,1fr)]">
        {open && (
          <div className="fixed inset-0 z-30 bg-foreground/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
        )}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-60 flex-col gap-4 border-r border-border bg-subtle p-3 transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Main navigation"
        >
          <div className="flex items-center justify-between">
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2 px-1.5 py-1 text-sm font-semibold">
              <span className="flex size-6 flex-col justify-center gap-0.5 rounded-md bg-primary p-1" aria-hidden>
                <span className="h-0.5 rounded bg-primary-foreground" />
                <span className="h-0.5 w-3/4 rounded bg-primary-foreground" />
                <span className="h-0.5 w-1/2 rounded bg-primary-foreground" />
              </span>
              Subcontractor readiness
            </Link>
            <button
              type="button"
              className="rounded-md p-1 hover:bg-muted lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <nav className="space-y-0.5">
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Workspace</p>
            <React.Suspense
              fallback={NAV.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              ))}
            >
              <NavLinks issueCount={issueCount} onNavigate={() => setOpen(false)} />
            </React.Suspense>
          </nav>

          <div className="mt-auto space-y-2">
            <div className="space-y-1.5">
              <DevToggle />
              <ThemeToggle />
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              Documentation status only. A person reviews and decides.
            </p>
            <SessionBar />
          </div>
        </aside>
        <div className="min-w-0">
          <DemoBanner />
          {children}
        </div>
      </div>
    </ShellContext.Provider>
  );
}
