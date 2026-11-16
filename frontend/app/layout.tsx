import type { Metadata } from "next";
import Link from "next/link";

import { SessionBar } from "@/components/SessionBar";

import "./globals.css";

export const metadata: Metadata = {
  title: "Subcontractor readiness",
  description: "Documentation status for subcontractor packets",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href="/" className="text-lg font-semibold">
              Subcontractor readiness
            </Link>
            <p className="text-xs text-slate-600">
              Documentation status only. A person reviews and decides.
            </p>
          </div>
          <div className="mx-auto max-w-5xl px-4 pb-2">
            <SessionBar />
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
