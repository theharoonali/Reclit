import { describe, expect, test } from "bun:test";
import {
  COL_WIDTH,
  dropSlotAt,
  GUTTER_WIDTH,
  HEADER_HEIGHT,
  hitTestHeader,
  isHeaderColumnHit,
} from "@/lib/ai-spreadsheet/geometry";
import type { Viewport } from "@/lib/ai-spreadsheet/types";

const viewport = (scrollX = 0): Viewport => ({
  width: 800,
  height: 400,
  scrollX,
  scrollY: 0,
  rowExtent: 100,
  columnCount: 3,
});

/** Canvas-space x for a point `offset` into column `col`. */
const atColumn = (col: number, offset: number, scrollX = 0) =>
  GUTTER_WIDTH + col * COL_WIDTH + offset - scrollX;

const MID_Y = HEADER_HEIGHT / 2;

describe("hitTestHeader", () => {
  test("finds the grip at a column's left edge", () => {
    const hit = hitTestHeader(atColumn(1, 6), MID_Y, viewport());
    expect(hit).toEqual({ kind: "header-grip", col: 1 });
  });

  test("finds the delete affordance at a column's right edge", () => {
    const hit = hitTestHeader(atColumn(1, COL_WIDTH - 16), MID_Y, viewport());
    expect(hit).toEqual({ kind: "header-delete", col: 1 });
  });

  test("falls through to the header between the two", () => {
    const hit = hitTestHeader(atColumn(1, COL_WIDTH / 2), MID_Y, viewport());
    expect(hit).toEqual({ kind: "header", col: 1 });
  });

  // The grip is content space, so it travels with the columns rather than
  // staying parked at a fixed spot on the canvas.
  test("the grip tracks the horizontal scroll", () => {
    const scrolled = viewport(COL_WIDTH);
    expect(hitTestHeader(atColumn(1, 6, COL_WIDTH), MID_Y, scrolled)).toEqual({
      kind: "header-grip",
      col: 1,
    });
    // Where the grip used to be is now the middle of column 0.
    expect(hitTestHeader(atColumn(1, 6), MID_Y, scrolled)).toEqual({
      kind: "header-grip",
      col: 2,
    });
  });

  test("the gutter and the area past the last column are not columns", () => {
    expect(hitTestHeader(4, MID_Y, viewport())).toEqual({ kind: "empty" });
    expect(isHeaderColumnHit(hitTestHeader(4, MID_Y, viewport()))).toBe(false);
  });
});

describe("isHeaderColumnHit", () => {
  test("covers all three column kinds and nothing else", () => {
    expect(isHeaderColumnHit({ kind: "header", col: 0 })).toBe(true);
    expect(isHeaderColumnHit({ kind: "header-delete", col: 0 })).toBe(true);
    expect(isHeaderColumnHit({ kind: "header-grip", col: 0 })).toBe(true);
    expect(isHeaderColumnHit({ kind: "plus" })).toBe(false);
    expect(isHeaderColumnHit({ kind: "cell", row: 0, col: 0 })).toBe(false);
  });
});

describe("dropSlotAt", () => {
  test("rounds to the nearest boundary, not the containing column", () => {
    expect(dropSlotAt(0, 3)).toBe(0);
    // Just left of centre still belongs to the gap before the column.
    expect(dropSlotAt(COL_WIDTH * 0.49, 3)).toBe(0);
    expect(dropSlotAt(COL_WIDTH * 0.51, 3)).toBe(1);
    expect(dropSlotAt(COL_WIDTH * 1.5, 3)).toBe(2);
  });

  // There are columnCount + 1 gaps: a column can be dropped after the last one.
  test("clamps to the gaps that exist", () => {
    expect(dropSlotAt(-500, 3)).toBe(0);
    expect(dropSlotAt(COL_WIDTH * 99, 3)).toBe(3);
  });
});
