"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { focusRing } from "../styles/focus-ring";
import { cn } from "../utils";

export type SwitchProps = React.ComponentPropsWithoutRef<
  typeof SwitchPrimitive.Root
>;

/**
 * The on/off switch for a setting that takes effect at once. Radix carries
 * the checked state and the `role="switch"` wiring; the track and thumb are
 * sized by the `switch*` tokens and the colours by the shared set, so it
 * reads as one control family with `Checkbox`.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-switch-track w-switch shrink-0 cursor-pointer items-center rounded-full bg-input px-0.5 transition-colors",
      "data-[state=checked]:bg-primary",
      "disabled:cursor-not-allowed disabled:opacity-50",
      focusRing,
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-switch-thumb rounded-full bg-background transition-transform data-[state=checked]:translate-x-switch-thumb data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

export { Switch };
