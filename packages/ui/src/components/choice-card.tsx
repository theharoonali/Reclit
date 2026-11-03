"use client";

import { cva } from "class-variance-authority";
import { Check, type LucideIcon } from "lucide-react";
import * as React from "react";
import { focusRing } from "../styles/focus-ring";
import { cn } from "../utils";

/**
 * A checkable card — checkbox semantics on a whole surface, for a short set
 * of options the user may pick several of (onboarding's use cases). One tab
 * stop per card; Space or Enter toggles it, as on any button.
 *
 * | size | for |
 * | --- | --- |
 * | `default` | a grid of cards: the icon in a tile, the title, a one-line description, the check mark in the corner |
 * | `compact` | a pill: the icon and the title, the check mark after them when checked — dense rows such as Settings. The description becomes the native tooltip |
 */
const choiceCardVariants = cva(
  cn(
    "relative flex text-left transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    focusRing,
  ),
  {
    variants: {
      size: {
        default: "w-full items-start gap-3 rounded-sm border p-4",
        compact:
          "inline-flex h-control-sm items-center gap-inline rounded-full border px-control-x-sm text-label",
      },
      checked: {
        true: "border-primary bg-primary/5",
        false: "border-input bg-transparent hover:bg-accent",
      },
    },
    compoundVariants: [
      { size: "compact", checked: true, className: "text-primary" },
      {
        size: "compact",
        checked: false,
        className: "text-muted-foreground hover:text-foreground",
      },
    ],
    defaultVariants: { size: "default", checked: false },
  },
);

export type ChoiceCardProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "title" | "type" | "role"
> & {
  /** A lucide icon component; the card sizes and colours it. */
  icon?: LucideIcon;
  title: string;
  /** One line under the title (`default`), the tooltip (`compact`). */
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: "default" | "compact";
};

const ChoiceCard = React.forwardRef<HTMLButtonElement, ChoiceCardProps>(
  (
    {
      icon: Icon,
      title,
      description,
      checked,
      onCheckedChange,
      size = "default",
      className,
      onClick,
      ...props
    },
    ref,
  ) => {
    const compact = size === "compact";
    return (
      <button
        aria-checked={checked}
        className={cn(choiceCardVariants({ size, checked }), className)}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) onCheckedChange(!checked);
        }}
        ref={ref}
        role="checkbox"
        title={compact ? description : undefined}
        type="button"
        {...props}
      >
        {compact ? (
          <>
            {Icon && <Icon aria-hidden="true" className="size-icon shrink-0" />}
            <span className="truncate">{title}</span>
            {checked && (
              <Check aria-hidden="true" className="size-icon shrink-0" />
            )}
          </>
        ) : (
          <>
            {Icon && (
              <span
                className={cn(
                  "flex size-control shrink-0 items-center justify-center rounded-sm transition-colors",
                  checked
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-icon" />
              </span>
            )}
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="block text-label">{title}</span>
              {description && (
                <span className="block text-caption text-muted-foreground">
                  {description}
                </span>
              )}
            </span>
            <span
              className={cn(
                "flex size-checkbox shrink-0 items-center justify-center rounded-full border transition-colors",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-transparent",
              )}
            >
              <Check aria-hidden="true" className="size-checkbox-mark" />
            </span>
          </>
        )}
      </button>
    );
  },
);
ChoiceCard.displayName = "ChoiceCard";

export { ChoiceCard, choiceCardVariants };
