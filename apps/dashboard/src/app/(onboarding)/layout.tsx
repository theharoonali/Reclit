import type { ReactNode } from "react";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";

/**
 * Chrome for onboarding: none. A user who has not onboarded has no workspace
 * yet, so the sidebar and header of `(app)` have nothing to show — the
 * FRONTEND.md rule is that different chrome means a second route group. The
 * gate sends an onboarded user back to the dashboard.
 */
export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OnboardingGate area="onboarding">
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8">
        {children}
      </div>
    </OnboardingGate>
  );
}
