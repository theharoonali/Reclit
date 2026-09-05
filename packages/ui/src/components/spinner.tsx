import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../utils";

const spinnerVariants = cva(
  // A ring with one coloured quarter: the muted track stays put while the
  // primary head sweeps, which reads as smoother than a bare arc.
  "inline-block animate-spin rounded-full border-solid border-muted border-t-primary",
  {
    variants: {
      size: {
        sm: "size-spinner-sm border-2",
        default: "size-spinner border-2",
        lg: "size-spinner-lg border-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerVariants> {}

/**
 * Purely decorative — it carries no accessible name. Whatever renders it is
 * responsible for announcing the loading state (see `LoadingState`).
 */
function Spinner({ className, size, ...props }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(spinnerVariants({ size, className }))}
      {...props}
    />
  );
}

export { Spinner, spinnerVariants };
