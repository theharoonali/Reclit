"use client";

import * as React from "react";
import { focusRing } from "../styles/focus-ring";
import { cn } from "../utils";

export type CapsuleOption<T extends string = string> = {
  value: T;
  label: string;
};

export type CapsuleSelectProps<T extends string = string> = {
  options: CapsuleOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  /** Point this at the `Label`'s id — `htmlFor` cannot target a radiogroup. */
  "aria-labelledby"?: string;
  "aria-label"?: string;
};

/**
 * A single-choice row of capsules — radio semantics without a popup, for short
 * option sets that should all stay visible. Follows the WAI-ARIA radio-group
 * pattern: one tab stop (the checked capsule), arrows move and select.
 */
function CapsuleSelect<T extends string = string>(
  props: CapsuleSelectProps<T>,
) {
  const { options, value, onValueChange, className, ...aria } = props;
  const groupRef = React.useRef<HTMLDivElement>(null);

  const moveBy = (offset: number) => {
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + offset + options.length) % options.length];
    if (next === undefined) return;
    onValueChange(next.value);
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
      ?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveBy(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveBy(-1);
    }
  };

  return (
    <div
      className={cn("flex flex-wrap gap-2", className)}
      onKeyDown={handleKeyDown}
      ref={groupRef}
      role="radiogroup"
      {...aria}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            aria-checked={checked}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-label transition-colors",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent text-muted-foreground hover:text-foreground",
              // Buttons keep the halo recipe: a checked capsule's border is
              // already the ring colour, so a border-only focus would vanish.
              focusRing,
            )}
            data-value={option.value}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            role="radio"
            tabIndex={checked ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { CapsuleSelect };
