/**
 * The wire's short ids: `row.<index>`, `col.<index>`, `cell.<r>.<c>`. They are
 * derived from the index, so parsing one back is exact rather than a guess —
 * see the contract header of `apps/api/src/__tests__/spreadsheet.api.test.ts`.
 */

const SHORT_ROW_RE = /^row\.(\d+)$/;
const SHORT_COLUMN_RE = /^col\.(\d+)$/;
/** The *scoped* cell id a run names: "<sheetId>.cell.<r>.<c>". */
const SCOPED_CELL_RE = /^([^.]+)\.cell\.(\d+)\.(\d+)$/;

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

export type ScopedCellAddress = { sheetId: string; row: number; col: number };

/**
 * "<sheetId>.cell.<r>.<c>" -> its parts; null for anything else. This is how
 * a run (`RunAi.cellId`, see the run-ai contract) finds its cell: the column
 * id it maps to is `col.<c>`, which is identity, so the key survives reorders.
 */
export function parseScopedCellId(id: string): ScopedCellAddress | null {
  const match = SCOPED_CELL_RE.exec(id);
  if (!match?.[1] || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  return {
    sheetId: match[1],
    row: Number.parseInt(match[2], 10),
    col: Number.parseInt(match[3], 10),
  };
}
