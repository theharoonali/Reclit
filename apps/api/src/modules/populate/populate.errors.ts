import { DomainError } from "../../common/errors";

// The populate feature's domain errors. Every code here is listed in the
// contract header of src/__tests__/populate.api.test.ts.

export class PopulateUnknownFieldError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "POPULATE_UNKNOWN_FIELD";
  constructor(names: string[]) {
    super(`No column is named ${names.map((name) => `"${name}"`).join(", ")}`);
    this.name = "PopulateUnknownFieldError";
  }
}

export class PopulateFieldNotFillableError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "POPULATE_FIELD_NOT_FILLABLE";
  constructor(names: string[]) {
    super(
      `${names.map((name) => `"${name}"`).join(", ")} cannot be filled: formula and AI columns are computed`,
    );
    this.name = "PopulateFieldNotFillableError";
  }
}
