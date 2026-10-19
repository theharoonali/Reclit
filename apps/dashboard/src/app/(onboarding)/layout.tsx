import type { ReactNode } from "react";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";

/**
 * Chrome for onboarding: none. A user who has not onboarded has no finished
 * workspace yet, so the sidebar and header of `(app)` have nothing to show —
 * the FRONTEND.md rule is that different chrome means a second route group.
 * The wrapper is the viewport and never scrolls; the wizard's two columns
 * scroll on their own. The gate sends an onboarded user back to the dashboard.
 */
export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OnboardingGate area="onboarding">
      <div className="h-dvh overflow-hidden bg-background">{children}</div>
    </OnboardingGate>
  );
}
