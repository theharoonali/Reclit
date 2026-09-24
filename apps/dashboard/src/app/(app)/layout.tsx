import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { WorkspaceHeaderTitle } from "@/components/workspace/workspace-header-title";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";

/**
 * The one chrome mount point. Every route in this group gets the sidebar and
 * header from here — never by rendering chrome itself.
 *
 * `OnboardingGate` sits outermost: it shows a full-screen loader while
 * `user.me` resolves and sends a user who has not onboarded to `/onboarding`,
 * so the shell and `workspace.list` mount only for an onboarded user.
 * `WorkspaceProvider` sits above the shell so the sidebar menu, the header
 * title and every page resolve the same active workspace.
 * `WorkspaceHeaderTitle` portals the active name into the header's title slot.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingGate area="app">
      <WorkspaceProvider>
        <AppShell>
          <WorkspaceHeaderTitle />
          {children}
        </AppShell>
      </WorkspaceProvider>
    </OnboardingGate>
  );
}
