"use client";

import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/components/ThemeProvider";

/** Toasts for passing confirmations. Anything the product requires stays on the page as well. */
export function Toaster() {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!border !border-border !bg-background !text-foreground !text-sm",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}
