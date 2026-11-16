"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn } from "@/components/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-sm font-medium transition-colors active:translate-y-px aria-disabled:opacity-60 aria-busy:opacity-80",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover active:bg-primary-hover",
        outline: "border-input bg-background text-foreground hover:bg-muted hover:border-foreground active:bg-muted",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-muted active:bg-muted",
        link: "border-transparent bg-transparent px-0 text-foreground underline underline-offset-4 hover:text-muted-foreground",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3",
        lg: "h-9 px-4",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner and keeps the width, and the click does nothing while it is true. */
    loading?: boolean;
    /** Text shown instead of the children while loading, for example "Saving…". */
    loadingText?: string;
    /**
     * The action cannot be done yet. The button keeps its pointer and hover (there is no
     * "not allowed" sign), does nothing when clicked, and explains why in a tooltip and a toast.
     */
    unavailable?: boolean;
    unavailableReason?: string;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, loadingText, unavailable, unavailableReason, onClick, children, type = "button", ...props },
  ref,
) {
  const inert = !!loading || !!unavailable;
  const button = (
    <button
      ref={ref}
      type={type}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={(e) => {
        if (inert) {
          e.preventDefault();
          if (unavailable && !loading && unavailableReason) toast(unavailableReason);
          return;
        }
        onClick?.(e);
      }}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
  if (unavailable && unavailableReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{unavailableReason}</TooltipContent>
      </Tooltip>
    );
  }
  return button;
});

export { buttonVariants };
