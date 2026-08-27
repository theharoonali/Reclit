// Deterministic scoped ids (docs/plans/006-spreadsheet-backend.md). The
// database pk is the scoped form "<sheetId>.row.<index>"; the wire carries the
// short form "row.<index>". The sheet id is a uuid and contains no ".", so the
// scoped format is unambiguous.

export const rowId = (sheetId: string, row: number) => `${sheetId}.row.${row}`;
export const columnId = (sheetId: string, col: number) =>
  `${sheetId}.col.${col}`;
export const cellId = (sheetId: string, row: number, col: number) =>
  `${sheetId}.cell.${row}.${col}`;

export const shortRowId = (row: number) => `row.${row}`;
export const shortColumnId = (col: number) => `col.${col}`;
export const shortCellId = (row: number, col: number) => `cell.${row}.${col}`;

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
