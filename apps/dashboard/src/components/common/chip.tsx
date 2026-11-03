import { cn } from "@reclit/ui/cn";
import type { ReactNode } from "react";

const TONES = {
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
} as const;

export type ChipTone = keyof typeof TONES;

/**
 * A small label chip beside a name: a column's type, the AI mark, a
 * document's status. `tone` carries the meaning — `success` is done,
 * `destructive` failed.
 */
export function Chip({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
