"use client";

import { Lock } from "lucide-react";
import * as React from "react";
import { focusRing } from "../styles/focus-ring";
import { cn } from "../utils";

export type CapsuleOption<T extends string = string> = {
  value: T;
  label: string;
  /** Visible, but not selectable. Arrow keys skip it. */
  locked?: boolean;
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
    const count = options.length;
    if (count === 0) return;
    const at = options.findIndex((option) => option.value === value);
    const step = offset > 0 ? 1 : -1;
    let index = at < 0 ? (step > 0 ? -1 : 0) : at;
    for (let n = 0; n < count; n++) {
      index = (index + step + count) % count;
      const next = options[index];
      if (next === undefined || next.locked) continue;
      onValueChange(next.value);
      groupRef.current
        ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
        ?.focus();
      return;
    }
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
        const locked = option.locked === true;
        return (
          <button
            aria-checked={checked}
            aria-disabled={locked || undefined}
            className={cn(
              "inline-flex h-control-sm items-center gap-inline rounded-full border px-control-x-sm text-label transition-colors",
              // Buttons keep the halo recipe: a checked capsule's border is
              // the ring colour, so a border-only focus would vanish.
              focusRing,
              locked && "cursor-default",
              checked
                ? "border-primary bg-transparent text-primary"
                : locked
                  ? "border-input bg-transparent text-muted-foreground/60"
                  : "border-input bg-transparent text-muted-foreground hover:text-foreground",
            )}
            data-value={option.value}
            key={option.value}
            onClick={() => {
              if (locked) return;
              onValueChange(option.value);
            }}
            role="radio"
            tabIndex={checked ? 0 : -1}
            type="button"
          >
            {locked && <Lock aria-hidden="true" className="size-icon" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { CapsuleSelect };
