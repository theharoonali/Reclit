import { parseShortColumnId } from "./short-ids";
import type { ActiveRun, CellAddress, SheetColumn } from "./types";
import { cellKey } from "./types";

/**
 * What a Run click would run, planned from the selected rectangle. Pure, so
 * the rules are testable without a canvas: the rectangle's rows, the
 * runnable columns inside it (an AI node with a prompt) as wire indexes, how
 * many cells that is, how many of them are already working, and whether the
 * selection is too large to send at all. A rectangle can span millions of
 * virtual rows, so its size is judged arithmetically before a single row is
 * enumerated.
 */

/**
 * Lockstep with the run-ai contract header (`runAi.runCells` limits), the
 * same way `ColumnType` mirrors the API's vocabulary — the dashboard may not
 * import API runtime values.
 */
export const MAX_RUN_ROWS = 1000;
export const MAX_RUN_CELLS = 5000;

/** Display positions, inclusive on both ends. */
export type SelectionRect = {
  rowFirst: number;
  rowLast: number;
  colFirst: number;
  colLast: number;
};

export type RunPlan = {
  /** Every row of the rectangle; empty when there is nothing to run or too much. */
  rowIndexes: number[];
  /** The runnable columns of the rectangle as wire indexes, in display order. */
  columnIndexes: number[];
  /** rows × runnable columns — the runs a click would create. */
  count: number;
  /** How many of those cells already have a working run. */
  busyCount: number;
  /** The selection is over `MAX_RUN_ROWS` or `MAX_RUN_CELLS`; nothing is sent. */
  tooLarge: boolean;
};

/** The rectangle between the anchor and the active cell — the active cell alone without one. */
export function selectionRect(
  active: CellAddress,
  anchor: CellAddress | null,
): SelectionRect {
  const corner = anchor ?? active;
  return {
    rowFirst: Math.min(corner.row, active.row),
    rowLast: Math.max(corner.row, active.row),
    colFirst: Math.min(corner.col, active.col),
    colLast: Math.max(corner.col, active.col),
  };
}

/**
 * Which columns a Run click would execute. A hand-kept mirror of `isRunnable`
 * in the API's `run-ai-batch.service.ts` (the dashboard may not import API
 * runtime values): every runnable node needs a prompt, and a Google Search
 * node needs source columns on top — without them there is nothing to search
 * for, so the column is half-finished and the Run button must not count it.
 */
const isRunnable = (column: SheetColumn) => {
  if (column.prompt === null) return false;
  switch (column.node) {
    case "ai":
      return true;
    case "google_search":
      return (column.config?.sourceColumns?.length ?? 0) > 0;
    default:
      return false;
  }
};

export function planRunTargets(
  columns: readonly SheetColumn[],
  rect: SelectionRect,
  runs: ReadonlyMap<string, ActiveRun>,
): RunPlan {
  const colLast = Math.min(rect.colLast, columns.length - 1);
  const runnable = columns.slice(rect.colFirst, colLast + 1).filter(isRunnable);
  const columnIndexes = runnable
    .map((column) => parseShortColumnId(column.id))
    .filter((index): index is number => index !== null);
  const rowCount = rect.rowLast - rect.rowFirst + 1;
  const count = rowCount * columnIndexes.length;
  const tooLarge =
    count > 0 && (rowCount > MAX_RUN_ROWS || count > MAX_RUN_CELLS);
  if (count === 0 || tooLarge) {
    return { rowIndexes: [], columnIndexes, count, busyCount: 0, tooLarge };
  }
  const rowIndexes = Array.from(
    { length: rowCount },
    (_, offset) => rect.rowFirst + offset,
  );
  let busyCount = 0;
  for (const row of rowIndexes) {
    for (const column of runnable) {
      if (runs.has(cellKey(row, column.id))) busyCount += 1;
    }
  }
  return { rowIndexes, columnIndexes, count, busyCount, tooLarge: false };
}
