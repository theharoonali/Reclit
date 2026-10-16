import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { fieldSingleLine } from "../styles/field";
import { focusField } from "../styles/focus-ring";
import { cn } from "../utils";

/**
 * | variant | for |
 * | --- | --- |
 * | `field` | the bordered text field — forms, dialogs, panels |
 * | `pill` | the field variant as a pill (the assistant island): the same border, placeholder and focus colour, `rounded-full`, the small control height, no background |
 */
const inputVariants = cva("", {
  variants: {
    variant: {
      field: cn(fieldSingleLine, "placeholder:text-muted-foreground"),
      pill: cn(
        "flex h-control-sm w-full min-w-0 rounded-full border border-input bg-transparent px-field-x text-body transition-colors",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        focusField,
      ),
    },
  },
  defaultVariants: { variant: "field" },
});

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

/**
 * The text field. In its default `field` variant the height, radius, border
 * and focus come from the shared field base, so it and `SelectTrigger` are the
 * same control with different innards.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants };
