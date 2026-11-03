import { DomainError } from "../../common/errors";

export class InvalidCredentialsError extends DomainError {
  readonly kind = "unauthorized";
  readonly code = "INVALID_CREDENTIALS";
  constructor() {
    super("Email or password is incorrect");
    this.name = "InvalidCredentialsError";
  }
}

export class AuthNotConfiguredError extends DomainError {
  readonly kind = "unavailable";
  readonly code = "AUTH_NOT_CONFIGURED";
  constructor() {
    super("AUTH_EMAIL and AUTH_PASSWORD are not set");
    this.name = "AuthNotConfiguredError";
  }
}
