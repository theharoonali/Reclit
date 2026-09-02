// Deterministic scoped ids (docs/plans/005-spreadsheet-backend.md). The
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

export type CellAddress = { sheetId: string; row: number; col: number };

const CELL_ID_RE = /^([^.]+)\.cell\.(\d+)\.(\d+)$/;

/**
 * The inverse of `cellId`: "<sheetId>.cell.<r>.<c>" -> its parts, or null for
 * anything else. The run-ai feature stores cell ids as plain strings and has
 * to find its way back to the sheet and the cell they name.
 */
export function parseCellId(id: string): CellAddress | null {
  const match = CELL_ID_RE.exec(id);
  if (!match?.[1] || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  return {
    sheetId: match[1],
    row: Number.parseInt(match[2], 10),
    col: Number.parseInt(match[3], 10),
  };
}
