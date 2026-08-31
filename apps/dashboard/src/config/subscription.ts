/**
 * Stubbed billing data — the app has no subscription backend yet, so the
 * sidebar credits block and the settings subscription cards read from here.
 * Labels are message keys into `settings.subscription` / `sidebar.credits`,
 * never display text (same convention as `nav.ts`).
 */

export type PlanId = "pro" | "premium";

export type Plan = {
  id: PlanId;
  /** USD per month. */
  price: number;
  /** Credits included per month. */
  credits: number;
};

export type Addon = {
  /** Stable key for React lists and message lookups. */
  id: string;
  /** USD, one-time. */
  price: number;
  credits: number;
};

/** The plan the (single) user is on. Stub until billing exists. */
export const currentPlanId: PlanId = "pro";

/** Stubbed usage shown in the sidebar credits bar. */
export const credits = { used: 700, total: 1000 };

export const plans: Plan[] = [
  { id: "pro", price: 29, credits: 1000 },
  { id: "premium", price: 59, credits: 3000 },
];

export const addons: Addon[] = [
  { id: "small", price: 10, credits: 350 },
  { id: "medium", price: 25, credits: 1000 },
  { id: "large", price: 45, credits: 2000 },
];
