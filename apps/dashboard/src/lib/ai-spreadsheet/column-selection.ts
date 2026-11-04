import type { SelectionAddresses } from "./row-selection";
import { storedRowBounds } from "./row-selection";
import { selectionRects } from "./run-targets";
import type { EditorState, SheetModel } from "./types";

/**
 * Whole-column selection. Like a row selection it is the editor's ordinary
 * rectangle — rows `0..rowLast` of one column — so Run AI and cell Delete read
 * it unchanged. Unlike a row selection it cannot be recognised from the
 * rectangle alone (a click on row 0 of a one-row sheet makes the same one),
 * so a header click leaves a mark naming the column it selected, and the
 * selection is a column selection only while the rectangle still matches it.
 */
export type ColumnMark = { columnId: string; rowLast: number };

/**
 * The corners of an area covering column `col` from row 0 down to the last
 * stored row (row 0 alone on an empty sheet). `active` sits at row 0 so the
 * ring and the first keystroke land on the top cell.
 */
export function columnSelection(
  model: SheetModel,
  col: number,
): SelectionAddresses & { rowLast: number } {
  const rowLast = Math.max(0, storedRowBounds(model)?.last ?? 0);
  return {
    anchor: { row: rowLast, col },
    active: { row: 0, col },
    rowLast,
  };
}

/**
 * The display index of the column the selection covers, or null when the
 * selection is no longer exactly the area the mark recorded — another click,
 * a keystroke that moved it, or a column change that shifted the indexes.
 */
export function selectedColumnIndex(
  editor: Pick<EditorState, "active" | "anchor" | "areas">,
  model: Pick<SheetModel, "columns">,
  mark: ColumnMark | null,
): number | null {
  if (mark === null) return null;
  const col = model.columns.findIndex((column) => column.id === mark.columnId);
  if (col < 0) return null;
  const rects = selectionRects(editor);
  const rect = rects[0];
  if (rects.length !== 1 || !rect) return null;
  return rect.colFirst === col &&
    rect.colLast === col &&
    rect.rowFirst === 0 &&
    rect.rowLast === mark.rowLast
    ? col
    : null;
}
