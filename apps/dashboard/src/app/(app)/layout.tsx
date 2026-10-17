import type { ReactNode } from "react";
import { AssistantIsland } from "@/components/assistant/assistant-island";
import { AssistantProvider } from "@/components/assistant/assistant-provider";
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
 * `AssistantProvider` sits above the shell too, so a page can register its
 * handlers with the assistant; `AssistantIsland` portals the capsule into the
 * header's centre slot (hidden where `scopeForPath` is null).
 * `WorkspaceHeaderTitle` portals the active name into the header's title slot.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingGate area="app">
      <WorkspaceProvider>
        <AssistantProvider>
          <AppShell>
            <WorkspaceHeaderTitle />
            <AssistantIsland />
            {children}
          </AppShell>
        </AssistantProvider>
      </WorkspaceProvider>
    </OnboardingGate>
  );
}
