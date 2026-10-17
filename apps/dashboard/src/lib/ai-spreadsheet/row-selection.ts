import type { CheckboxPaintState } from "./paint-checkbox";
import { selectionRects } from "./run-targets";
import type { CellAddress, EditorState, SheetModel } from "./types";

/**
 * Whole-row selection, as pure arithmetic over the editor's areas. A row
 * selection is not a second kind of selection: it is a selection whose every
 * area spans every column, so Delete rows, cell Delete and Run AI all read
 * the one set of areas. These helpers build such areas and recognise them;
 * nothing here touches a canvas or React.
 */

/** Inclusive on both ends; display rows. */
export type RowRange = { first: number; last: number };

export type SelectionAddresses = { anchor: CellAddress; active: CellAddress };

/**
 * The corners of an area covering rows `anchorRow..activeRow` and every
 * column. `active` sits at column 0 so a keystroke edits the row's first cell
 * and its ring stays at the left edge; the anchor takes the last column.
 * Callers guard `columnCount === 0` — there is no row to select then.
 */
export const rowRangeAddresses = (
  anchorRow: number,
  activeRow: number,
  columnCount: number,
): SelectionAddresses => ({
  anchor: { row: anchorRow, col: columnCount - 1 },
  active: { row: activeRow, col: 0 },
});

/** Overlapping or touching ranges folded together, ascending. */
export function mergeRowRanges(ranges: readonly RowRange[]): RowRange[] {
  const sorted = [...ranges].sort((a, b) => a.first - b.first);
  const merged: RowRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.first <= last.last + 1) {
      last.last = Math.max(last.last, range.last);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * The rows of a selection whose every area spans every column, as merged
 * ascending ranges; null when an area leaves a column out, nothing is
 * selected, or the sheet has no columns.
 */
export function selectedRowRanges(
  editor: Pick<EditorState, "active" | "anchor" | "areas">,
  columnCount: number,
): RowRange[] | null {
  if (columnCount === 0) return null;
  const rects = selectionRects(editor);
  if (rects.length === 0) return null;
  const ranges: RowRange[] = [];
  for (const rect of rects) {
    if (rect.colFirst > 0 || rect.colLast < columnCount - 1) return null;
    ranges.push({ first: rect.rowFirst, last: rect.rowLast });
  }
  return mergeRowRanges(ranges);
}

/** How many rows the (merged) ranges hold — the header's "N rows selected". */
export const rowCountOf = (ranges: readonly RowRange[]) =>
  ranges.reduce((count, range) => count + range.last - range.first + 1, 0);

const inRanges = (ranges: readonly RowRange[], row: number) =>
  ranges.some((range) => row >= range.first && row <= range.last);

/** Every row index the model knows holds a stored row or a stored cell. */
export function storedRows(model: SheetModel): Set<number> {
  const rows = new Set<number>(model.rowIds.keys());
  for (const key of model.cells.keys()) {
    const row = Number.parseInt(key, 10);
    if (Number.isInteger(row)) rows.add(row);
  }
  return rows;
}

/** The first and last stored row, or null for a sheet with nothing stored. */
export function storedRowBounds(model: SheetModel): RowRange | null {
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const row of storedRows(model)) {
    if (row < first) first = row;
    if (row > last) last = row;
  }
  return first <= last ? { first, last } : null;
}

/** The stored rows inside the ranges, ascending — what Delete rows sends. */
export function storedRowsIn(
  model: SheetModel,
  ranges: readonly RowRange[],
): number[] {
  return [...storedRows(model)]
    .filter((row) => inRanges(ranges, row))
    .sort((a, b) => a - b);
}

/**
 * What the header corner should paint: `all` when a whole-row selection
 * covers every stored row, `some` for any other whole-row selection, `none`
 * otherwise — an area that leaves a column out is `none` however many rows
 * it covers, and so is a sheet with nothing stored, since there is nothing
 * for "all" to mean.
 */
export function selectAllState(
  editor: Pick<EditorState, "active" | "anchor" | "areas">,
  model: SheetModel,
  columnCount: number,
): CheckboxPaintState {
  const ranges = selectedRowRanges(editor, columnCount);
  if (!ranges) return "none";
  const stored = storedRows(model);
  if (stored.size === 0) return "none";
  for (const row of stored) if (!inRanges(ranges, row)) return "some";
  return "all";
}
