import * as React from "react";
import { cn } from "../utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

/**
 * A form label. Plain `<label>` on purpose — shadcn's version wraps
 * `@radix-ui/react-label` for one `mousedown` guard against double-click text
 * selection, which is not worth a dependency here.
 *
 * It exists so no component hand-writes `text-label text-card-foreground`
 * again: label typography is one edit, in one file.
 */
const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      // biome-ignore lint/a11y/noLabelWithoutControl: a shared primitive cannot name its control; every call site passes `htmlFor`.
      <label
        className={cn(
          "text-label text-card-foreground",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Label.displayName = "Label";

export { Label };
