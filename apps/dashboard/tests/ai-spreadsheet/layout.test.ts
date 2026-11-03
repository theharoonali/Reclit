import { describe, expect, test } from "bun:test";
import { createFormatters } from "@/lib/ai-spreadsheet/cell-format";
import { ROW_HEIGHT } from "@/lib/ai-spreadsheet/geometry";
import {
  buildLayout,
  caretPosition,
  colAt,
  colLeft,
  colWidth,
  LINE_HEIGHT,
  MAX_CELL_LINES,
  MAX_COL_WIDTH,
  MIN_COL_WIDTH,
  nearestColBoundary,
  rowAt,
  rowHeight,
  rowHeightFor,
  rowTop,
  type SheetLayout,
  uniformLayout,
  wrapLines,
  wrapRanges,
} from "@/lib/ai-spreadsheet/layout";
import { cellKey, type SheetColumn } from "@/lib/ai-spreadsheet/types";
import {
  CHAR_WIDTH,
  createRecordingContext,
  TEST_LABELS,
} from "../support/canvas";

const { ctx } = createRecordingContext();
const FORMATTERS = createFormatters("en-US");
const FONTS = { cell: "14px sans-serif", header: "14px sans-serif" };

const PLAIN = { node: null, prompt: null } as const;
const COLUMNS: SheetColumn[] = [
  { ...PLAIN, id: "col.0", name: "Name", type: "string" },
  { ...PLAIN, id: "col.1", name: "Age", type: "number" },
];

const build = (cells: [number, string, unknown][]) =>
  buildLayout({
    ctx,
    columns: COLUMNS,
    cells: new Map(
      cells.map(([row, columnId, value]) => [
        cellKey(row, columnId),
        value as never,
      ]),
    ),
    labels: TEST_LABELS,
    formatters: FORMATTERS,
    fonts: FONTS,
  });

describe("wrapRanges", () => {
  // The stub measures 7px per character, so 10 characters fit in 70px.
  test("wraps at word boundaries and preserves indexes", () => {
    const text = "aaa bbb ccc";
    // 7 characters fit: "aaa bbb " (8, with its kept trailing space) does
    // not, so the break lands after the first word.
    const ranges = wrapRanges(ctx, text, 7 * CHAR_WIDTH);
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual([
      "aaa ",
      "bbb ccc",
    ]);
    expect(ranges[0]).toEqual({ start: 0, end: 4 });
    expect(ranges[1]).toEqual({ start: 4, end: 11 });
  });

  test("honours embedded newlines, empty lines included", () => {
    expect(wrapLines(ctx, "a\n\nb", 100 * CHAR_WIDTH)).toEqual(["a", "", "b"]);
  });

  test("breaks a word wider than the line by character", () => {
    expect(wrapLines(ctx, "abcdefgh", 3 * CHAR_WIDTH)).toEqual([
      "abc",
      "def",
      "gh",
    ]);
  });

  test("stops at maxLines so huge texts cost nothing more", () => {
    const lines = wrapLines(ctx, "x ".repeat(10_000), 4 * CHAR_WIDTH, 5);
    expect(lines).toHaveLength(5);
  });

  test("empty text is one empty line", () => {
    expect(wrapLines(ctx, "", 100)).toEqual([""]);
  });
});

describe("caretPosition", () => {
  test("maps an index to its wrapped line and x", () => {
    const text = "aaa bbb ccc";
    const ranges = wrapRanges(ctx, text, 7 * CHAR_WIDTH);
    expect(caretPosition(ctx, text, ranges, 0)).toEqual({ line: 0, x: 0 });
    expect(caretPosition(ctx, text, ranges, 9)).toEqual({
      line: 1,
      x: 5 * CHAR_WIDTH,
    });
    expect(caretPosition(ctx, text, ranges, text.length)).toEqual({
      line: 1,
      x: 7 * CHAR_WIDTH,
    });
  });
});

describe("column fitting", () => {
  test("a short column fits tight, a long one caps at the maximum", () => {
    const layout = build([
      [0, "col.0", "hi"],
      [
        1,
        "col.0",
        "A sentence long enough that its measured width passes the maximum column width cap easily.",
      ],
    ]);
    expect(colWidth(layout, 0)).toBe(MAX_COL_WIDTH);
    // "Age" with its header chrome: tighter than the old fixed 160, never
    // under the minimum.
    expect(colWidth(layout, 1)).toBeGreaterThanOrEqual(MIN_COL_WIDTH);
    expect(colWidth(layout, 1)).toBeLessThan(160);
    expect(colLeft(layout, 2)).toBe(colWidth(layout, 0) + colWidth(layout, 1));
  });

  test("colAt and nearestColBoundary agree with the offsets", () => {
    const layout = build([]);
    const w0 = colWidth(layout, 0);
    expect(colAt(layout, 0)).toBe(0);
    expect(colAt(layout, w0 - 1)).toBe(0);
    expect(colAt(layout, w0)).toBe(1);
    expect(nearestColBoundary(layout, w0 - 1)).toBe(1);
    expect(nearestColBoundary(layout, 1)).toBe(0);
  });
});

describe("row heights", () => {
  const tall = (layout: SheetLayout, row: number) => rowHeight(layout, row);

  test("a wrapped string cell grows its row; others stay the default", () => {
    const layout = build([
      [2, "col.0", "word ".repeat(200)], // far past one line at MAX width
      [4, "col.0", "short"],
    ]);
    expect(tall(layout, 4)).toBe(ROW_HEIGHT);
    expect(tall(layout, 2)).toBe(rowHeightFor(MAX_CELL_LINES));
    // Offsets: row 3 starts after row 2's grown height.
    expect(rowTop(layout, 3)).toBe(
      2 * ROW_HEIGHT + rowHeightFor(MAX_CELL_LINES),
    );
  });

  test("rowAt inverts rowTop across tall rows", () => {
    const layout = build([[1, "col.0", "line one\nline two\nline three"]]);
    expect(tall(layout, 1)).toBe(3 * LINE_HEIGHT + 12);
    for (const row of [0, 1, 2, 3, 50]) {
      expect(rowAt(layout, rowTop(layout, row))).toBe(row);
      expect(rowAt(layout, rowTop(layout, row) + tall(layout, row) - 1)).toBe(
        row,
      );
    }
  });

  test("the cap holds at MAX_CELL_LINES", () => {
    const layout = build([[0, "col.0", "x\n".repeat(50)]]);
    expect(tall(layout, 0)).toBe(rowHeightFor(MAX_CELL_LINES));
  });

  test("a uniform layout has no tall rows", () => {
    const layout = uniformLayout(3);
    expect(rowTop(layout, 10)).toBe(10 * ROW_HEIGHT);
    expect(rowAt(layout, 10 * ROW_HEIGHT + 5)).toBe(10);
  });
});
