import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceHeaderTitle } from "@/components/workspace/workspace-header-title";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";

/**
 * The one chrome mount point. Every route in this group gets the sidebar,
 * header and footer from here — never by rendering chrome itself.
 *
 * `WorkspaceProvider` sits above the shell so the sidebar menu, the header
 * title and every page resolve the same active workspace.
 * `WorkspaceHeaderTitle` portals the active name into the header's title slot.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <AppShell>
        <WorkspaceHeaderTitle />
        {children}
      </AppShell>
    </WorkspaceProvider>
  );
}
