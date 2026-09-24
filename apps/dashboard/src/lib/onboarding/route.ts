/**
 * Which route group a gate is guarding: the app behind the chrome, or the
 * onboarding screen in front of it.
 */
export type OnboardingArea = "app" | "onboarding";

/**
 * Where a user in `area` belongs, or `null` when they are already there. A
 * user who has not onboarded is sent to `/onboarding`; one who has is sent
 * away from it to the dashboard.
 */
export function onboardingRedirect(
  user: { onboardingCompleted: boolean },
  area: OnboardingArea,
): "/" | "/onboarding" | null {
  if (area === "app" && !user.onboardingCompleted) return "/onboarding";
  if (area === "onboarding" && user.onboardingCompleted) return "/";
  return null;
}
