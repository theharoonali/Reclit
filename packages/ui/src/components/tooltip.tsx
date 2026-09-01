"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { cn } from "../utils";

/**
 * The shared tooltip — shadcn's, on Radix.
 *
 * Per docs/rules/FRONTEND.md the generated source keeps two edits: `cn` comes
 * from this package, and **every enter/exit animation class is stripped**. A
 * stuck exit animation keeps the content mounted and swallows clicks on
 * whatever is underneath it.
 */
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipPortal = TooltipPrimitive.Portal;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    className={cn(
      "z-50 overflow-hidden rounded-sm border border-border bg-popover px-2 py-1 text-caption text-popover-foreground shadow-md",
      className,
    )}
    ref={ref}
    sideOffset={sideOffset}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
};
