// Framework-free: services and routers import from here, and that graph is
// transpiled into the dashboard build (docs/rules/BACKEND.md hard rule 1).

/** Transport-agnostic error class. Routers map it via `mapDomainError` in
 * `src/trpc/init.ts`; REST maps it in `common/domain-error.filter.ts`. */
export type DomainErrorKind =
  | "not_found"
  | "bad_request"
  | "conflict"
  | "unavailable"
  | "upstream";

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;
  /** Stable machine-readable code, e.g. "NOTE_NOT_FOUND". */
  abstract readonly code: string;
}
