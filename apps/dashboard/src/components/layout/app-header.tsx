import type { ReactNode } from "react";
import { HeaderActionsOutlet, HeaderTitleOutlet } from "./header-actions";

/**
 * The top bar. Takes its content as slots so it stays feature-agnostic —
 * it never imports a feature component.
 */
export function AppHeader({
  title,
  actions,
}: {
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-4 md:px-6">
      {title && (
        <div className="hidden shrink-0 text-label lg:block">{title}</div>
      )}
      {/* The left title landing area — a page portals its title in with
          `<HeaderTitle>` (see header-actions.tsx). */}
      <HeaderTitleOutlet />

      {/* `actions` is the static slot; the outlet is where a page portals its
          own controls in (see header-actions.tsx). Both are right-aligned; an
          empty flex item has no size. */}
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <HeaderActionsOutlet />
      </div>
    </header>
  );
}
