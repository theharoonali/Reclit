/**
 * The wire's short ids: `row.<index>`, `col.<index>`, `cell.<r>.<c>`. They are
 * derived from the index, so parsing one back is exact rather than a guess —
 * see the contract header of `apps/api/src/__tests__/spreadsheet.api.test.ts`.
 */

const SHORT_ROW_RE = /^row\.(\d+)$/;
const SHORT_COLUMN_RE = /^col\.(\d+)$/;

/** "row.42" -> 42; null when the string is not a short row id. */
export function parseShortRowId(id: string): number | null {
  const match = SHORT_ROW_RE.exec(id);
  return match?.[1] !== undefined ? Number.parseInt(match[1], 10) : null;
}

/** "col.3" -> 3; null when the string is not a short column id. */
export function parseShortColumnId(id: string): number | null {
  const match = SHORT_COLUMN_RE.exec(id);
  return match?.[1] !== undefined ? Number.parseInt(match[1], 10) : null;
}
