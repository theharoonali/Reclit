import { cn } from "@reclit/ui/cn";
import type { ReactNode } from "react";

/**
 * The frame of a normal `(app)` page: the gutters (`<main>` has none — pages
 * own theirs), the width cap, and — when the page has one — the title +
 * description header. A page renders this and one or two feature
 * components, nothing else.
 *
 * `narrow` is for a single-column page such as `/populate`; `wide` drops the
 * cap for a page that lays out its own grid (the dashboard). A full-bleed page
 * (the sheet) does not use this at all.
 */
export function PageShell({
  title,
  description,
  narrow = false,
  wide = false,
  children,
}: {
  /** Absent: no header, the content starts at the top (the dashboard). */
  title?: string;
  description?: string;
  narrow?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-8 px-4 py-8 md:px-8",
        narrow ? "max-w-3xl" : wide ? "max-w-none" : "max-w-6xl",
      )}
    >
      {title && (
        <header className="space-y-1">
          <h1 className="text-title">{title}</h1>
          {description && (
            <p className="text-subtitle text-muted-foreground">{description}</p>
          )}
        </header>
      )}

      {children}
    </div>
  );
}
