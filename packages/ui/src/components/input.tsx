import * as React from "react";
import { fieldSingleLine } from "../styles/field";
import { cn } from "../utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * The text field. Height, radius, border and focus come from the shared field
 * base, so it and `SelectTrigger` are the same control with different innards.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          fieldSingleLine,
          "placeholder:text-muted-foreground",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
