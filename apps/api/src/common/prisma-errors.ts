// Prisma error-code predicates shared by ≥2 services
// (docs/rules/BACKEND.md "No repetition").

const PRISMA_RECORD_NOT_FOUND = "P2025";
const PRISMA_UNIQUE_VIOLATION = "P2002";

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

export const isRecordNotFound = (error: unknown): boolean =>
  hasCode(error, PRISMA_RECORD_NOT_FOUND);

export const isUniqueViolation = (error: unknown): boolean =>
  hasCode(error, PRISMA_UNIQUE_VIOLATION);
