import type { SheetHit, Viewport } from "./types";

/**
 * Every measurement in the sheet, in CSS pixels. The canvas context is set up
 * with `setTransform(dpr, …)` once, so nothing below ever thinks about device
 * pixels — mixing the two is the classic "clicks land one cell off at DPR 2".
 */

export const ROW_HEIGHT = 32;
export const COL_WIDTH = 160;
export const HEADER_HEIGHT = 36;
/** Just wide enough for a 7-digit row number at `GUTTER_FONT_SIZE`. */
export const GUTTER_WIDTH = 48;
export const CELL_PAD_X = 10;
/** The gutter is tight, so its numbers get their own smaller inset. */
export const GUTTER_PAD_X = 6;
/** The "+ column" affordance, parked after the last column in the header. */
export const PLUS_COLUMN_WIDTH = 44;
export const OVERSCAN = 2;

/** Type-scale sizes, mirrored on the canvas: text-body, text-label, caption. */
export const CELL_FONT_SIZE = 14;
export const HEADER_FONT_SIZE = 14;
export const TYPE_FONT_SIZE = 11;
export const GUTTER_FONT_SIZE = 11;

/** The capsule chip shared by JSON, file and boolean cells. */
export const CAPSULE_HEIGHT = 20;
export const CAPSULE_PAD_X = 8;
/** The status dot a boolean capsule carries before its label. */
export const CAPSULE_DOT = 6;
/** The play/pause glyph a audio capsule carries before its label. */
export const CAPSULE_GLYPH = 8;
/** Between either mark and the label that follows it. */
export const CAPSULE_DOT_GAP = 6;

/**
 * The scroll spacer is clamped, and this is the load-bearing number in the
 * whole feature. 5,000,000 rows x 32px is 160,000,000px of content, but a
 * scrollable element tops out at roughly 33.5M px in Chrome and Safari and
 * 17.9M px in Firefox. A 1:1 spacer would silently strand ~79% of the sheet
 * in Chrome and ~89% in Firefox, and the bug reads as "scrolling just stops".
 *
 * So the spacer is fixed at a size every engine handles, and scroll positions
 * are mapped through `scrollScale`. Do not "simplify" this back to 1:1.
 */
export const MAX_SPACER_PX = 8_000_000;

/**
 * Blank rows past `rowCount` are handed out a thousand at a time; the tail
 * extends as the viewport approaches it, so the sheet never hits a floor.
 */
export const BLANK_TAIL_CHUNK = 1_000;

export type Rect = { x: number; y: number; w: number; h: number };

export const contentHeight = (rowExtent: number) => rowExtent * ROW_HEIGHT;

export const contentWidth = (columnCount: number) =>
  GUTTER_WIDTH + columnCount * COL_WIDTH + PLUS_COLUMN_WIDTH;

/** How many content pixels one scrollbar pixel is worth. 1 when unclamped. */
export function scrollScale(rowExtent: number, viewportHeight: number) {
  const content = contentHeight(rowExtent);
  if (content <= MAX_SPACER_PX) return 1;
  const usable = MAX_SPACER_PX - viewportHeight;
  if (usable <= 0) return 1;
  return (content - viewportHeight) / usable;
}

export const spacerHeight = (rowExtent: number) =>
  Math.min(contentHeight(rowExtent), MAX_SPACER_PX);

export const maxScrollY = (rowExtent: number, viewportHeight: number) =>
  Math.max(0, contentHeight(rowExtent) - viewportHeight);

export const maxScrollX = (columnCount: number, viewportWidth: number) =>
  Math.max(0, contentWidth(columnCount) - viewportWidth);

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** True once the viewport is close enough to the bottom to need more rows. */
export function needsMoreRows(viewport: Viewport) {
  const lastVisible = (viewport.scrollY + viewport.height) / ROW_HEIGHT;
  return lastVisible > viewport.rowExtent - BLANK_TAIL_CHUNK / 2;
}

export function visibleRows(viewport: Viewport) {
  const first = Math.max(
    0,
    Math.floor(viewport.scrollY / ROW_HEIGHT) - OVERSCAN,
  );
  const last = Math.min(
    viewport.rowExtent - 1,
    Math.floor((viewport.scrollY + viewport.height) / ROW_HEIGHT) + OVERSCAN,
  );
  return { first, last };
}

export function visibleCols(viewport: Viewport) {
  const bodyWidth = Math.max(0, viewport.width - GUTTER_WIDTH);
  const first = Math.max(
    0,
    Math.floor(viewport.scrollX / COL_WIDTH) - OVERSCAN,
  );
  const last = Math.min(
    viewport.columnCount - 1,
    Math.floor((viewport.scrollX + bodyWidth) / COL_WIDTH) + OVERSCAN,
  );
  return { first, last };
}

/**
 * Content-space rect: the painters translate by `(GUTTER_WIDTH - scrollX,
 * -scrollY)` before drawing cells, so scroll is already accounted for.
 */
export const cellRect = (row: number, col: number): Rect => ({
  x: col * COL_WIDTH,
  y: row * ROW_HEIGHT,
  w: COL_WIDTH,
  h: ROW_HEIGHT,
});

/** Content-space rect of the "+ column" affordance in the header. */
export const plusButtonRect = (columnCount: number): Rect => ({
  x: columnCount * COL_WIDTH,
  y: 0,
  w: PLUS_COLUMN_WIDTH,
  h: HEADER_HEIGHT,
});

export const containsPoint = (rect: Rect, x: number, y: number) =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

/**
 * Maps a pointer position on the *body* canvas to a cell. `x` and `y` are CSS
 * pixels relative to the canvas, i.e. `clientX - getBoundingClientRect().left`.
 */
export function hitTest(x: number, y: number, viewport: Viewport): SheetHit {
  const row = Math.floor((y + viewport.scrollY) / ROW_HEIGHT);
  if (row < 0 || row >= viewport.rowExtent) return { kind: "empty" };
  if (x < GUTTER_WIDTH) return { kind: "gutter", row };

  const col = Math.floor((x - GUTTER_WIDTH + viewport.scrollX) / COL_WIDTH);
  if (col < 0 || col >= viewport.columnCount) return { kind: "empty" };
  return { kind: "cell", row, col };
}

/** The same, for the *header* canvas, which shares the horizontal scroll. */
export function hitTestHeader(x: number, viewport: Viewport): SheetHit {
  if (x < GUTTER_WIDTH) return { kind: "empty" };
  const contentX = x - GUTTER_WIDTH + viewport.scrollX;
  const col = Math.floor(contentX / COL_WIDTH);
  if (col >= 0 && col < viewport.columnCount) return { kind: "header", col };
  if (containsPoint(plusButtonRect(viewport.columnCount), contentX, 0)) {
    return { kind: "plus" };
  }
  return { kind: "empty" };
}
