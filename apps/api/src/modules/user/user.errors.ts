import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors).

export class UserNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "USER_NOT_FOUND";
  constructor() {
    super("No user exists; the database was never seeded");
    this.name = "UserNotFoundError";
  }
}
