import { cn } from "@reclit/ui/cn";
import type { ReactNode } from "react";

/** A small label chip beside a name: a column's type, a card's chart, the AI mark. */
export function OnboardingChip({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "primary";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption",
        tone === "primary"
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
