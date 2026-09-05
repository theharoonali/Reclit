import { cn } from "@reclit/ui/cn";
import type { ReactNode } from "react";

/**
 * The frame of a normal `(app)` page: the gutters (`<main>` has none — pages
 * own theirs), the width cap, and the title + description header. A page
 * renders this and one or two feature components, nothing else.
 *
 * `narrow` is for a single-column page such as `/populate`. A full-bleed page
 * (the sheet) does not use this at all.
 */
export function PageShell({
  title,
  description,
  narrow = false,
  children,
}: {
  title: string;
  description: string;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-8 px-4 py-8 md:px-8",
        narrow ? "max-w-3xl" : "max-w-6xl",
      )}
    >
      <header className="space-y-1">
        <h1 className="text-title">{title}</h1>
        <p className="text-subtitle text-muted-foreground">{description}</p>
      </header>

      {children}
    </div>
  );
}
