import * as React from "react";
import { fieldMultiLine } from "../styles/field";
import { cn } from "../utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * The multi-line text field. Same field base as `Input`, with a minimum
 * height instead of a fixed one.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          fieldMultiLine,
          "placeholder:text-muted-foreground",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
