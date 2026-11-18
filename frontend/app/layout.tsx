import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { AssessmentProvider } from "@/components/AssessmentProvider";
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
    <html lang="en" data-dev="off" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={150}>
            <QueryProvider>
              <AssessmentProvider>
                <DevDetailsProvider>
                  <AppShell>{children}</AppShell>
                  <Toaster />
                </DevDetailsProvider>
              </AssessmentProvider>
            </QueryProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
