import type { Metadata } from "next";
import Link from "next/link";

import { DevDetailsProvider, DevToggle } from "@/components/DevDetails";
import { QueryProvider } from "@/components/QueryProvider";
import { SessionBar } from "@/components/SessionBar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: "Subcontractor readiness",
  description: "Documentation status for subcontractor packets",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={150}>
            <QueryProvider>
              <DevDetailsProvider>
                <header className="border-b border-border">
                  <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link href="/" className="text-sm font-semibold hover:underline">
                        Subcontractor readiness
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Documentation status only. A person reviews and decides.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DevToggle />
                      <ThemeToggle />
                    </div>
                  </div>
                  <div className="border-t border-border bg-subtle">
                    <div className="mx-auto max-w-5xl px-4 py-1.5">
                      <SessionBar />
                    </div>
                  </div>
                </header>
                <div className="mx-auto max-w-5xl px-4 py-5">{children}</div>
                <Toaster />
              </DevDetailsProvider>
            </QueryProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
