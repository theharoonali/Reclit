import type { UseCase } from "./api";

/** Every use case, in the order the cards show them — `OTHER` last. */
export const USE_CASES: readonly UseCase[] = [
  "LEAD_RESEARCH",
  "HIRING",
  "EMAIL_OUTREACH",
  "FORM_INTAKE",
  "CUSTOMER_INSIGHTS",
  "OTHER",
];

/** Adds or removes `key`, keeping `USE_CASES` order and no repeats. */
export function toggleUseCase(
  picked: readonly UseCase[],
  key: UseCase,
): UseCase[] {
  const next = new Set(picked);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return USE_CASES.filter((useCase) => next.has(useCase));
}

/**
 * The `company.update` payload for a pick: the "Other" text trimmed, and
 * `null` unless `OTHER` is picked (the server clears it the same way).
 */
export function toUseCaseUpdate(
  picked: readonly UseCase[],
  other: string,
): { useCases: UseCase[]; useCaseOther: string | null } {
  const useCases = USE_CASES.filter((useCase) => picked.includes(useCase));
  const text = other.trim();
  return {
    useCases,
    useCaseOther: useCases.includes("OTHER") && text !== "" ? text : null,
  };
}

/** True when the pick differs from what is saved — Save and Next skip a no-op write. */
export function isUseCaseChange(
  saved: { useCases: readonly UseCase[]; useCaseOther: string | null },
  picked: readonly UseCase[],
  other: string,
): boolean {
  const next = toUseCaseUpdate(picked, other);
  const before = toUseCaseUpdate(saved.useCases, saved.useCaseOther ?? "");
  return (
    next.useCaseOther !== before.useCaseOther ||
    next.useCases.join() !== before.useCases.join()
  );
}
