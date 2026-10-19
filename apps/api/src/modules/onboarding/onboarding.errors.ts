import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors).

/** The wizard's model calls without a `GOOGLE_GENERATIVE_AI_API_KEY` on the api. */
export class OnboardingAiUnavailableError extends DomainError {
  readonly kind = "unavailable";
  readonly code = "ONBOARDING_AI_UNAVAILABLE";
  constructor() {
    super(
      "Onboarding AI is not configured: GOOGLE_GENERATIVE_AI_API_KEY is not set",
    );
    this.name = "OnboardingAiUnavailableError";
  }
}

/** The model refused or failed a wizard call, or answered nothing usable. */
export class OnboardingAiFailedError extends DomainError {
  readonly kind = "upstream";
  readonly code = "ONBOARDING_AI_FAILED";
  constructor(cause: string) {
    super(`Onboarding AI failed: ${cause}`);
    this.name = "OnboardingAiFailedError";
  }
}

/** Onboarding runs once; later workspaces come from `workspace.create`. */
export class OnboardingAlreadyCompletedError extends DomainError {
  readonly kind = "conflict";
  readonly code = "ONBOARDING_ALREADY_COMPLETED";
  constructor() {
    super("Onboarding is already completed");
    this.name = "OnboardingAlreadyCompletedError";
  }
}
