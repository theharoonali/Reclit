import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors).

/** Onboarding runs once; later workspaces come from `workspace.create`. */
export class OnboardingAlreadyCompletedError extends DomainError {
  readonly kind = "conflict";
  readonly code = "ONBOARDING_ALREADY_COMPLETED";
  constructor() {
    super("Onboarding is already completed");
    this.name = "OnboardingAlreadyCompletedError";
  }
}
