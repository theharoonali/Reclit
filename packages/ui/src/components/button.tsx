import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { focusRing } from "../styles/focus-ring";
import { cn } from "../utils";

/**
 * Every clickable thing in the app. Reach for a `variant` rather than a
 * `className` full of utilities — a consumer that needs a look this file does
 * not have gets a new variant here, not an override at the call site.
 *
 * | variant | for |
 * | --- | --- |
 * | `default` | the one primary action on a surface |
 * | `secondary` | a supporting action next to a primary one |
 * | `outline` | a neutral action that still needs an edge — toolbars, empty states |
 * | `ghost` | dense or repeated actions: icon buttons, list rows, cancel |
 * | `destructive` | delete, and nothing else |
 * | `destructive-outline` | a destructive action that is not the surface's primary emphasis |
 * | `link` | an action that reads as text |
 *
 * Icons need no classes: the base sizes any `svg` child to `size-icon` and
 * spaces it with `gap-inline`. `<Plus />`, not `<Plus className="mr-2 h-4 w-4" />`.
 *
 * Every length is a token from `tokens.ts` (`h-control`, `px-control-x` …),
 * so resizing the app's buttons is one edit there.
 */
const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-inline whitespace-nowrap rounded-sm text-label transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-icon [&_svg]:shrink-0",
    focusRing,
  ),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        "destructive-outline":
          "border border-destructive bg-transparent text-destructive hover:bg-destructive/10",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-control px-control-x py-control-y",
        sm: "h-control-sm px-control-x-sm text-caption",
        lg: "h-control-lg px-control-x-lg",
        icon: "h-control w-control",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
