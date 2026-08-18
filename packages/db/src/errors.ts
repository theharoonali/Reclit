// Typed domain errors with stable string codes. Add your own as the
// schema grows; keep the `code` literal so API layers can map them.
export class NotFoundError extends Error {
  code = "NOT_FOUND" as const;

  constructor(resource = "Resource") {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}
