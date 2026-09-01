import type { SheetHit, Viewport } from "./types";

/**
 * Every measurement in the sheet, in CSS pixels. The canvas context is set up
 * with `setTransform(dpr, …)` once, so nothing below ever thinks about device
 * pixels — mixing the two is the classic "clicks land one cell off at DPR 2".
 */

export const ROW_HEIGHT = 32;
export const COL_WIDTH = 160;
export const HEADER_HEIGHT = 36;
/**
 * A selection checkbox plus a row number at `GUTTER_FONT_SIZE`, kept snug so
 * the number sits close to the checkbox. Comfortable through 6 digits; a
 * 7-digit number (row 1,000,000+) reaches the checkbox's edge.
 */
export const GUTTER_WIDTH = 56;
export const CELL_PAD_X = 10;
/** The gutter is tight, so its numbers get their own smaller inset. */
export const GUTTER_PAD_X = 6;
/** The row-selection checkbox parked at the left edge of the gutter. */
export const CHECKBOX_SIZE = 14;
export const CHECKBOX_PAD_X = 6;
/** The checked state's mini fill box, inset from the outline on every side. */
export const CHECKBOX_INNER_INSET = 4;
/** The "+ column" affordance, parked after the last column in the header. */
export const PLUS_COLUMN_WIDTH = 44;
/** The delete affordance at the right edge of a hovered column header. */
export const HEADER_DELETE_SIZE = 14;
/** Extra slack around the delete glyph so it is comfortably clickable. */
export const HEADER_DELETE_HIT_PAD = 3;
/** The drag handle at the left edge of a column header. */
export const HEADER_GRIP_WIDTH = 8;
export const HEADER_GRIP_HEIGHT = 12;
/** Its inset from the column's left edge — snugger than `CELL_PAD_X`. */
export const HEADER_GRIP_PAD_X = 4;
/** Extra slack around the grip, like the delete glyph's. */
export const HEADER_GRIP_HIT_PAD = 4;
/** Between the grip and whatever the column paints next. */
export const HEADER_GRIP_GAP = 4;
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

/** Content-space rect of a column header's delete affordance. */
export const headerDeleteRect = (col: number): Rect => ({
  x: (col + 1) * COL_WIDTH - CELL_PAD_X - HEADER_DELETE_SIZE,
  y: (HEADER_HEIGHT - HEADER_DELETE_SIZE) / 2,
  w: HEADER_DELETE_SIZE,
  h: HEADER_DELETE_SIZE,
});

/** Content-space rect of a column header's drag handle. */
export const headerGripRect = (col: number): Rect => ({
  x: col * COL_WIDTH + HEADER_GRIP_PAD_X,
  y: (HEADER_HEIGHT - HEADER_GRIP_HEIGHT) / 2,
  w: HEADER_GRIP_WIDTH,
  h: HEADER_GRIP_HEIGHT,
});

/**
 * The gap a drop at `contentX` lands in: the nearest column boundary. `slot`
 * runs 0..columnCount — one more than there are columns, because a column can
 * be dropped after the last one.
 */
export const dropSlotAt = (contentX: number, columnCount: number) =>
  clamp(Math.round(contentX / COL_WIDTH), 0, columnCount);

/** Content-space rect of the "+ column" affordance in the header. */
export const plusButtonRect = (columnCount: number): Rect => ({
  x: columnCount * COL_WIDTH,
  y: 0,
  w: PLUS_COLUMN_WIDTH,
  h: HEADER_HEIGHT,
});

/**
 * A row's selection checkbox. `x` is gutter space (the gutter never scrolls
 * horizontally); `y` is content space — subtract `scrollY` to paint, add it
 * to hit-test.
 */
export const gutterCheckboxRect = (row: number): Rect => ({
  x: CHECKBOX_PAD_X,
  y: row * ROW_HEIGHT + (ROW_HEIGHT - CHECKBOX_SIZE) / 2,
  w: CHECKBOX_SIZE,
  h: CHECKBOX_SIZE,
});

/** The select-all checkbox in the header's corner block. Canvas space. */
export const headerCheckboxRect = (): Rect => ({
  x: CHECKBOX_PAD_X,
  y: (HEADER_HEIGHT - CHECKBOX_SIZE) / 2,
  w: CHECKBOX_SIZE,
  h: CHECKBOX_SIZE,
});

/** The rect grown by `pad` on every side — a finger-friendlier hit zone. */
export const inflateRect = (rect: Rect, pad: number): Rect => ({
  x: rect.x - pad,
  y: rect.y - pad,
  w: rect.w + pad * 2,
  h: rect.h + pad * 2,
});

export const containsPoint = (rect: Rect, x: number, y: number) =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

/**
 * True for every header hit that names a column. The three kinds are distinct
 * so that crossing between them repaints, but the painter's hover wash and the
 * pointer handler's "same hit?" check both want them treated alike.
 */
export const isHeaderColumnHit = (
  hit: SheetHit,
): hit is Extract<
  SheetHit,
  { kind: "header" | "header-delete" | "header-grip" }
> =>
  hit.kind === "header" ||
  hit.kind === "header-delete" ||
  hit.kind === "header-grip";

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
export function hitTestHeader(
  x: number,
  y: number,
  viewport: Viewport,
): SheetHit {
  if (x < GUTTER_WIDTH) return { kind: "empty" };
  const contentX = x - GUTTER_WIDTH + viewport.scrollX;
  const col = Math.floor(contentX / COL_WIDTH);
  if (col >= 0 && col < viewport.columnCount) {
    // Left edge, then right edge, then the rest — the two zones are disjoint,
    // so this reads in x order rather than expressing a precedence.
    const grip = inflateRect(headerGripRect(col), HEADER_GRIP_HIT_PAD);
    if (containsPoint(grip, contentX, y)) return { kind: "header-grip", col };
    const zone = inflateRect(headerDeleteRect(col), HEADER_DELETE_HIT_PAD);
    if (containsPoint(zone, contentX, y)) return { kind: "header-delete", col };
    return { kind: "header", col };
  }
  if (containsPoint(plusButtonRect(viewport.columnCount), contentX, 0)) {
    return { kind: "plus" };
  }
  return { kind: "empty" };
}
