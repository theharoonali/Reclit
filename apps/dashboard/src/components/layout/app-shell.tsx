import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { HeaderActionsProvider } from "./header-actions";

/**
 * The only file that knows the overall page geometry.
 *
 * The shell fills the viewport and never scrolls itself (`h-dvh` +
 * `overflow-hidden`). That fixes the sidebar and the header in place and leaves
 * `<main>` as the single scroll container, so the chrome cannot be scrolled
 * away. `h-dvh` rather than `h-screen` so mobile browser chrome does not clip
 * the bottom of the page.
 *
 * `<main>` carries no padding: a page that wants gutters adds its own, and a
 * full-bleed page (`/ai-spreadsheet`) gets the whole area.
 *
 * Mounted once from `app/(app)/layout.tsx`; no page renders chrome itself. A
 * page that needs a control in the header portals it there with
 * `<HeaderActions>` rather than rendering its own bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <HeaderActionsProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </HeaderActionsProvider>
  );
}
