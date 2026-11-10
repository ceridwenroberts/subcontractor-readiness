import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subcontractor readiness",
  description: "Documentation status for subcontractor packets",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
