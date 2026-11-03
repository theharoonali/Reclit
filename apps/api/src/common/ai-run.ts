// The `AiRun` table holds every kind of AI run — cell, assistant, dashboard
// generation (docs/plans/044-table-consolidation.md). A column one kind needs
// is nullable in the schema because another kind leaves it empty; the
// migration's per-kind CHECK guarantees it is set. The kind services read
// those columns through `present`, which turns an impossible null into a
// loud invariant error instead of a silent `!`.

/** `value`, or an invariant error naming the run and column. */
export function present<T>(
  value: T | null | undefined,
  column: string,
  id: string,
): T {
  if (value === null || value === undefined) {
    throw new Error(`AiRun ${id}: "${column}" is required for its kind`);
  }
  return value;
}
