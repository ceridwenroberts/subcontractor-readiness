"use client";

import { Menu } from "lucide-react";
import * as React from "react";

import { useShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

/** Title band at the top of every page, with the menu button on narrow screens. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { openMenu } = useShell();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={openMenu} aria-label="Open menu">
            <Menu className="size-4" aria-hidden />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 lg:px-8">{children}</main>;
}
