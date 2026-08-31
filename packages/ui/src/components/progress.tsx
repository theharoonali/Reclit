import * as React from "react";
import { cn } from "../utils";

/**
 * A plain-div progress bar — no Radix dependency. The track is a tinted pill,
 * the fill animates with the house motion tokens. Pass `aria-label` (or
 * labelled-by) so the bar reads meaningfully.
 */
const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: number; max?: number }
>(({ className, value, max = 100, ...props }, ref) => {
  const bounded = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (bounded / max) * 100 : 0;

  return (
    <div
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={bounded}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-primary/15",
        className,
      )}
      ref={ref}
      role="progressbar"
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-smooth ease-smooth"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
});
Progress.displayName = "Progress";

export { Progress };
