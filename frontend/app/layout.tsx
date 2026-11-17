import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DevDetailsProvider } from "@/components/DevDetails";
import { QueryProvider } from "@/components/QueryProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
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
                <AppShell>{children}</AppShell>
                <Toaster />
              </DevDetailsProvider>
            </QueryProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
