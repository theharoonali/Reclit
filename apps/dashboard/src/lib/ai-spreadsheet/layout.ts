import { formatCellText, isJsonObject, isResourceUrl } from "./cell-format";
import { emailCellCounts, isEmailNode } from "./email-cell";
import { measureWidth } from "./text-metrics";
import type {
  CellValue,
  SheetColumn,
  SheetFormatters,
  SheetLabels,
} from "./types";

// The base size constants live HERE (geometry.ts re-exports them) so the
// import graph stays one-way: layout → cell-format/text-metrics/types,
// geometry → layout. geometry.ts must never be imported from this file.

export const ROW_HEIGHT = 32;
/** The pre-fit uniform width; still the fallback before the first build. */
export const COL_WIDTH = 160;
export const CELL_PAD_X = 10;
/** The capsule chip shared by JSON, file and boolean cells. */
export const CAPSULE_HEIGHT = 20;
export const CAPSULE_PAD_X = 8;
/** The status dot a boolean capsule carries before its label. */
export const CAPSULE_DOT = 6;
/** The play/pause glyph a audio capsule carries before its label. */
export const CAPSULE_GLYPH = 8;
/** Between either mark and the label that follows it. */
export const CAPSULE_DOT_GAP = 6;
/** The drag handle at the left edge of a column header. */
export const HEADER_GRIP_WIDTH = 8;
/** Between the grip and whatever the column paints next. */
export const HEADER_GRIP_GAP = 4;

/**
 * The sheet's variable geometry: per-column widths fitted to content between
 * a minimum and a maximum, and per-row heights grown to the tallest wrapped
 * string cell, capped at MAX_CELL_LINES. Built from the model (every stored
 * cell is client-side — fetch-all-rows.ts), consumed by geometry.ts, the
 * painters and the hooks. Rows not listed in `tallRows` are the default
 * ROW_HEIGHT; columns beyond `colLefts` do not exist.
 *
 * The structure is immutable per build; `buildLayout` is called when the
 * data, the columns or the fonts change — never per frame.
 */

export const MIN_COL_WIDTH = 96;
export const MAX_COL_WIDTH = 360;
/** One text line inside a cell; 1 line + 2*CELL_PAD_Y = the classic 32px row. */
export const LINE_HEIGHT = 20;
export const CELL_PAD_Y = 6;
/** A row grows to at most this many wrapped lines; the rest is elided. */
export const MAX_CELL_LINES = 10;
/** Cheapest possible glyph width, used to early-out huge texts unmeasured. */
const MIN_CHAR_WIDTH = 5;

export type SheetLayout = {
  /** Left edge of each display column in body content space; length n+1 (last = total width). */
  colLefts: number[];
  /** Stored rows taller than ROW_HEIGHT, ascending. */
  tallRows: number[];
  /** Height of tallRows[i]. */
  tallHeights: number[];
  /** Sum of (height - ROW_HEIGHT) of every tall row before tallRows[i]. */
  extraBefore: number[];
  /** Total extra height of all tall rows. */
  totalExtra: number;
};

/** The uniform layout painting starts from before the first build. */
export function uniformLayout(
  columnCount: number,
  width = COL_WIDTH,
): SheetLayout {
  const colLefts: number[] = [];
  for (let col = 0; col <= columnCount; col++) colLefts.push(col * width);
  return {
    colLefts,
    tallRows: [],
    tallHeights: [],
    extraBefore: [],
    totalExtra: 0,
  };
}

export const rowHeightFor = (lines: number) =>
  Math.max(1, Math.min(lines, MAX_CELL_LINES)) * LINE_HEIGHT + CELL_PAD_Y * 2;

/* ------------------------------------------------------------- columns */

export const colLeft = (layout: SheetLayout, col: number) =>
  layout.colLefts[Math.max(0, Math.min(col, layout.colLefts.length - 1))] ?? 0;

export const colWidth = (layout: SheetLayout, col: number) =>
  colLeft(layout, col + 1) - colLeft(layout, col);

export const totalColsWidth = (layout: SheetLayout) =>
  layout.colLefts[layout.colLefts.length - 1] ?? 0;

/** The display column containing body content x; -1 before 0, count past the end. */
export function colAt(layout: SheetLayout, x: number): number {
  const lefts = layout.colLefts;
  const count = lefts.length - 1;
  if (x < 0) return -1;
  if (x >= (lefts[count] ?? 0)) return count;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((lefts[mid] ?? 0) <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The nearest column boundary to x — the reorder drop slot, 0..count. */
export function nearestColBoundary(layout: SheetLayout, x: number): number {
  const col = Math.max(
    0,
    Math.min(colAt(layout, x), layout.colLefts.length - 2),
  );
  const left = colLeft(layout, col);
  const right = colLeft(layout, col + 1);
  // A midpoint tie goes right, matching Math.round of the uniform days.
  return x - left < right - x ? col : col + 1;
}

/* ---------------------------------------------------------------- rows */

/** Index of the last tall row <= row, or -1. */
function tallIndexBefore(layout: SheetLayout, row: number): number {
  const rows = layout.tallRows;
  let lo = 0;
  let hi = rows.length - 1;
  if (hi < 0 || (rows[0] as number) > row) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((rows[mid] as number) <= row) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Extra height accumulated strictly above `row`. */
export function extraAbove(layout: SheetLayout, row: number): number {
  const index = tallIndexBefore(layout, row - 1);
  if (index < 0) return 0;
  return (
    (layout.extraBefore[index] ?? 0) +
    ((layout.tallHeights[index] ?? ROW_HEIGHT) - ROW_HEIGHT)
  );
}

export const rowTop = (layout: SheetLayout, row: number) =>
  row * ROW_HEIGHT + extraAbove(layout, row);

export function rowHeight(layout: SheetLayout, row: number): number {
  const index = tallIndexBefore(layout, row);
  if (index >= 0 && layout.tallRows[index] === row) {
    return layout.tallHeights[index] ?? ROW_HEIGHT;
  }
  return ROW_HEIGHT;
}

/** The row containing content y (>= 0); clamping to extent is the caller's. */
export function rowAt(layout: SheetLayout, y: number): number {
  if (y < 0) return Math.floor(y / ROW_HEIGHT);
  const rows = layout.tallRows;
  // Binary search the last tall row whose TOP is <= y, counting the extras
  // of the tall rows before it; between tall rows the grid is uniform.
  let lo = -1;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const top =
      (rows[mid] as number) * ROW_HEIGHT + (layout.extraBefore[mid] ?? 0);
    if (top <= y) lo = mid;
    else hi = mid - 1;
  }
  if (lo < 0) return Math.floor(y / ROW_HEIGHT);
  const tallRow = rows[lo] as number;
  const top = tallRow * ROW_HEIGHT + (layout.extraBefore[lo] ?? 0);
  const height = layout.tallHeights[lo] ?? ROW_HEIGHT;
  if (y < top + height) return tallRow;
  return tallRow + 1 + Math.floor((y - top - height) / ROW_HEIGHT);
}

/* ------------------------------------------------------------- wrapping */

/** One wrapped line as a [start, end) slice of the original text. */
export type WrapRange = { start: number; end: number };

/**
 * Greedy word wrap at `maxWidth`, honouring embedded newlines, returned as
 * index ranges over the original text so the editor can map a caret index to
 * a (line, x). A word wider than the line is broken by character; a line
 * keeps its trailing space. `maxLines` caps the work — one more line than
 * the display cap is requested so callers can tell "exactly cap" from
 * "more", and huge texts stop costing once the cap is hit.
 */
export function wrapRanges(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = MAX_CELL_LINES + 1,
): WrapRange[] {
  const ranges: WrapRange[] = [];
  let pos = 0;
  for (;;) {
    if (ranges.length >= maxLines) return ranges;
    const newline = text.indexOf("\n", pos);
    const hardEnd = newline === -1 ? text.length : newline;
    if (pos === hardEnd) {
      ranges.push({ start: pos, end: hardEnd });
    }
    let start = pos;
    while (start < hardEnd) {
      if (ranges.length >= maxLines) return ranges;
      // Extend break by break (a break sits after each space) while it fits.
      let fit = start;
      let probe = start;
      while (probe < hardEnd) {
        const space = text.indexOf(" ", probe);
        const candidate =
          space === -1 || space >= hardEnd ? hardEnd : space + 1;
        if (measureWidth(ctx, text.slice(start, candidate)) <= maxWidth) {
          fit = candidate;
          probe = candidate;
        } else {
          break;
        }
      }
      if (fit === start) {
        // Not even the first word fits: break it by character.
        fit = start + 1;
        while (
          fit < hardEnd &&
          measureWidth(ctx, text.slice(start, fit + 1)) <= maxWidth
        ) {
          fit++;
        }
      }
      ranges.push({ start, end: fit });
      start = fit;
    }
    if (hardEnd === text.length) break;
    pos = hardEnd + 1;
  }
  if (ranges.length === 0) ranges.push({ start: 0, end: 0 });
  return ranges;
}

/** `wrapRanges` as plain strings — what the cell painter draws. */
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = MAX_CELL_LINES + 1,
): string[] {
  return wrapRanges(ctx, text, maxWidth, maxLines).map((range) =>
    text.slice(range.start, range.end),
  );
}

/** The wrapped line holding caret `index`, and the caret's x inside it. */
export function caretPosition(
  ctx: CanvasRenderingContext2D,
  text: string,
  ranges: WrapRange[],
  index: number,
): { line: number; x: number } {
  let line = 0;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i] as WrapRange;
    if (index >= range.start) line = i;
    if (index < range.end) break;
  }
  const range = ranges[line] as WrapRange;
  const upTo = Math.max(range.start, Math.min(index, range.end));
  return { line, x: measureWidth(ctx, text.slice(range.start, upTo)) };
}

/* ------------------------------------------------------------- building */

const CAPSULE_CHROME =
  CELL_PAD_X * 2 + CAPSULE_PAD_X * 2 + CAPSULE_DOT + CAPSULE_DOT_GAP;

/** True for the column types whose text wraps into extra lines. */
const wrapsText = (column: SheetColumn) =>
  !isEmailNode(column) && column.type === "string";

export type LayoutInputs = {
  ctx: CanvasRenderingContext2D;
  columns: SheetColumn[];
  /** "<row>:<columnId>" keys, walked once; rows are sparse. */
  cells: ReadonlyMap<string, CellValue>;
  labels: SheetLabels;
  formatters: SheetFormatters;
  fonts: { cell: string; header: string };
};

/**
 * One pass over the sparse stored cells: per column the widest content, per
 * row the tallest cell. Width fitting measures the single-line text (longest
 * embedded line); height fitting wraps string cells at the fitted width.
 * Both are memoised underneath by `measureWidth`.
 */
export function buildLayout(inputs: LayoutInputs): SheetLayout {
  const { ctx, columns, cells, labels, formatters } = inputs;
  const colIndexById = new Map<string, number>();
  columns.forEach((column, index) => {
    colIndexById.set(column.id, index);
  });

  /* ---- pass 1: fitted widths ---- */
  ctx.font = inputs.fonts.header;
  const widths = columns.map((column) =>
    Math.min(
      MAX_COL_WIDTH,
      Math.max(
        MIN_COL_WIDTH,
        measureWidth(ctx, column.name) +
          CELL_PAD_X * 2 +
          HEADER_GRIP_WIDTH +
          HEADER_GRIP_GAP +
          60, // the type label / delete affordance share the right edge
      ),
    ),
  );
  ctx.font = inputs.fonts.cell;
  const widthOf = (column: SheetColumn, value: CellValue): number => {
    if (value === null) return 0;
    if (isEmailNode(column)) {
      const counts = emailCellCounts(value);
      if (counts) return CAPSULE_CHROME * 2 + 24; // two small count chips
    }
    if (column.type === "json" && isJsonObject(value)) {
      return (
        measureWidth(ctx, labels.jsonCapsule(Object.keys(value).length)) +
        CAPSULE_CHROME
      );
    }
    if (
      (column.type === "file" || column.type === "audio") &&
      isResourceUrl(value)
    ) {
      return MIN_COL_WIDTH + 40; // a filename chip; never drives the max
    }
    const text = formatCellText(value, column.type, labels, formatters);
    if (text === "") return 0;
    // A text this long hits MAX_COL_WIDTH whatever the glyphs are.
    if (text.length * MIN_CHAR_WIDTH >= MAX_COL_WIDTH) return MAX_COL_WIDTH;
    let widest = 0;
    for (const line of text.split("\n")) {
      widest = Math.max(widest, measureWidth(ctx, line));
    }
    return widest + CELL_PAD_X * 2;
  };

  /** rowIndex -> tallest line count, collected during the width pass. */
  const textCells: { row: number; col: number; text: string }[] = [];
  for (const [key, value] of cells) {
    if (value === null) continue;
    const splitAt = key.indexOf(":");
    const row = Number.parseInt(key.slice(0, splitAt), 10);
    const col = colIndexById.get(key.slice(splitAt + 1));
    if (col === undefined || Number.isNaN(row)) continue;
    const column = columns[col] as SheetColumn;
    widths[col] = Math.min(
      MAX_COL_WIDTH,
      Math.max(widths[col] ?? MIN_COL_WIDTH, widthOf(column, value)),
    );
    if (wrapsText(column) && typeof value === "string") {
      const fitted = widths[col] as number;
      if (value.includes("\n") || value.length * MIN_CHAR_WIDTH > fitted) {
        textCells.push({ row, col, text: value });
      }
    }
  }

  const colLefts: number[] = [0];
  for (const width of widths) {
    colLefts.push((colLefts[colLefts.length - 1] as number) + width);
  }

  /* ---- pass 2: row heights at the fitted widths ---- */
  const heightByRow = new Map<number, number>();
  for (const cell of textCells) {
    const inner = (widths[cell.col] as number) - CELL_PAD_X * 2;
    const lines = wrapLines(ctx, cell.text, inner).length;
    if (lines <= 1) continue;
    const height = rowHeightFor(lines);
    const known = heightByRow.get(cell.row) ?? ROW_HEIGHT;
    if (height > known) heightByRow.set(cell.row, height);
  }

  const tallRows = [...heightByRow.keys()].sort((a, b) => a - b);
  const tallHeights = tallRows.map((row) => heightByRow.get(row) as number);
  const extraBefore: number[] = [];
  let total = 0;
  for (const height of tallHeights) {
    extraBefore.push(total);
    total += height - ROW_HEIGHT;
  }

  return { colLefts, tallRows, tallHeights, extraBefore, totalExtra: total };
}
