import { parseShortColumnId } from "./short-ids";
import type {
  ActiveRun,
  CellAddress,
  EditorState,
  SelectionRect,
  SheetColumn,
} from "./types";
import { cellKey } from "./types";

export type { SelectionRect } from "./types";

/**
 * What a Run click would run, planned from the selected areas. Pure, so the
 * rules are testable without a canvas: the runnable columns inside each area
 * (an AI node with a prompt), the calls to make, how many cells that is, how
 * many of them are already working, and whether the selection is too large
 * to send at all. An area can span millions of virtual rows, so its size is
 * judged arithmetically before a single row is enumerated.
 */

/**
 * Lockstep with the run-ai contract header (`runAi.runCells` limits), the
 * same way `ColumnType` mirrors the API's vocabulary — the dashboard may not
 * import API runtime values.
 */
export const MAX_RUN_ROWS = 1000;
export const MAX_RUN_CELLS = 5000;

/** One `runAi.runCells` call: every row runs every column, as wire indexes. */
export type RunBatch = { rowIndexes: number[]; columnIndexes: number[] };

export type RunPlan = {
  /**
   * The calls a click would make, in row order. One for a plain rectangle; a
   * multi-area selection is grouped by the set of runnable columns each row
   * has selected, so every cell is sent exactly once and a row's AI columns
   * stay in one call (the API runs them as a series). Empty when there is
   * nothing to run or too much.
   */
  batches: RunBatch[];
  /** Selected runnable cells, each counted once — the runs a click would create. */
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
 * Every area of the selection: the earlier ones first, the current rectangle
 * last; none without an active cell.
 */
export function selectionRects(
  editor: Pick<EditorState, "active" | "anchor" | "areas">,
): SelectionRect[] {
  if (!editor.active) return [];
  return [...editor.areas, selectionRect(editor.active, editor.anchor)];
}

export const containsCell = (rect: SelectionRect, row: number, col: number) =>
  row >= rect.rowFirst &&
  row <= rect.rowLast &&
  col >= rect.colFirst &&
  col <= rect.colLast;

/**
 * Which columns a Run click would execute. A hand-kept mirror of `isRunnable`
 * in the API's `run-ai-batch.service.ts` (the dashboard may not import API
 * runtime values): a node with an executor, and a prompt — a column that has
 * a node but no prompt yet is half-finished, and the Run button must not
 * count it. A mail (`email`) column must also be a text or JSON column.
 */
const isRunnable = (column: SheetColumn) => {
  if (column.prompt === null) return false;
  switch (column.node) {
    case "ai":
    case "google_search":
      return true;
    case "email":
      return column.type === "string" || column.type === "json";
    default:
      return false;
  }
};

/** How many distinct rows the rectangles cover, by merging their row spans. */
function unionRowCount(rects: readonly SelectionRect[]): number {
  const spans = rects
    .map((rect) => ({ first: rect.rowFirst, last: rect.rowLast }))
    .sort((a, b) => a.first - b.first);
  let total = 0;
  let open: { first: number; last: number } | null = null;
  for (const span of spans) {
    if (open && span.first <= open.last + 1) {
      open.last = Math.max(open.last, span.last);
      continue;
    }
    if (open) total += open.last - open.first + 1;
    open = { ...span };
  }
  if (open) total += open.last - open.first + 1;
  return total;
}

export function planRunBatches(
  columns: readonly SheetColumn[],
  rects: readonly SelectionRect[],
  runs: ReadonlyMap<string, ActiveRun>,
): RunPlan {
  // Each area's runnable columns, by display position, so a row's set keeps
  // display order whichever areas contributed to it.
  const areas = rects.flatMap((rect) => {
    const colLast = Math.min(rect.colLast, columns.length - 1);
    const runnable: { display: number; column: SheetColumn }[] = [];
    for (let col = rect.colFirst; col <= colLast; col++) {
      const column = columns[col];
      if (column && isRunnable(column)) runnable.push({ display: col, column });
    }
    return runnable.length === 0 ? [] : [{ rect, runnable }];
  });
  if (areas.length === 0) {
    return { batches: [], count: 0, busyCount: 0, tooLarge: false };
  }

  // Judged before enumerating: an area can be millions of rows tall. Rows
  // are the union of the areas' spans; cells are summed per area, so
  // overlapping areas count twice — erring towards a refusal, never towards
  // a send over the cap.
  const cellSum = areas.reduce(
    (sum, area) =>
      sum + (area.rect.rowLast - area.rect.rowFirst + 1) * area.runnable.length,
    0,
  );
  const rowCount = unionRowCount(areas.map((area) => area.rect));
  if (rowCount > MAX_RUN_ROWS || cellSum > MAX_RUN_CELLS) {
    return { batches: [], count: cellSum, busyCount: 0, tooLarge: true };
  }

  // Row → its selected runnable columns, deduplicated across the areas.
  const rows = new Map<number, Map<number, SheetColumn>>();
  for (const area of areas) {
    for (let row = area.rect.rowFirst; row <= area.rect.rowLast; row++) {
      let cols = rows.get(row);
      if (!cols) {
        cols = new Map();
        rows.set(row, cols);
      }
      for (const { display, column } of area.runnable)
        cols.set(display, column);
    }
  }

  // Rows with the same column set share a call — one call for a rectangle.
  const groups = new Map<
    string,
    { rowIndexes: number[]; columns: SheetColumn[] }
  >();
  for (const [row, cols] of [...rows].sort((a, b) => a[0] - b[0])) {
    const ordered = [...cols]
      .sort((a, b) => a[0] - b[0])
      .map(([, column]) => column);
    const key = ordered.map((column) => column.id).join(",");
    let group = groups.get(key);
    if (!group) {
      group = { rowIndexes: [], columns: ordered };
      groups.set(key, group);
    }
    group.rowIndexes.push(row);
  }

  let count = 0;
  let busyCount = 0;
  const batches: RunBatch[] = [];
  for (const group of groups.values()) {
    count += group.rowIndexes.length * group.columns.length;
    for (const row of group.rowIndexes) {
      for (const column of group.columns) {
        if (runs.has(cellKey(row, column.id))) busyCount += 1;
      }
    }
    batches.push({
      rowIndexes: group.rowIndexes,
      columnIndexes: group.columns
        .map((column) => parseShortColumnId(column.id))
        .filter((index): index is number => index !== null),
    });
  }
  return { batches, count, busyCount, tooLarge: false };
}
