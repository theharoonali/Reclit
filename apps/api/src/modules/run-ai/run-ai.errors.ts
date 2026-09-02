import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors).

export class RunAiNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "RUN_AI_NOT_FOUND";
  constructor(id: string) {
    super(`RunAi ${id} not found`);
    this.name = "RunAiNotFoundError";
  }
}
