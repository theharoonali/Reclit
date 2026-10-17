import { beforeEach, describe, expect, test } from "bun:test";
import { createFormatters } from "@/lib/ai-spreadsheet/cell-format";
import {
  CHECKBOX_SIZE,
  COL_WIDTH,
  GUTTER_WIDTH,
  ROW_HEIGHT,
} from "@/lib/ai-spreadsheet/geometry";
import { paintBody } from "@/lib/ai-spreadsheet/paint-body";
import { paintEditor } from "@/lib/ai-spreadsheet/paint-editor";
import { clearMetricsCache } from "@/lib/ai-spreadsheet/text-metrics";
import type {
  EditorState,
  SheetFonts,
  SheetModel,
  Viewport,
} from "@/lib/ai-spreadsheet/types";
import {
  createRecordingContext,
  TEST_LABELS,
  TEST_PALETTE,
  textCalls,
} from "../support/canvas";

const FORMATTERS = createFormatters("en-US");

const FONTS: SheetFonts = {
  cell: "14px sans-serif",
  header: "14px sans-serif",
  type: "11px sans-serif",
  gutter: "11px sans-serif",
};

const VIEWPORT: Viewport = {
  width: 800,
  height: 400,
  scrollX: 0,
  scrollY: 0,
  rowExtent: 100,
  columnCount: 3,
};

const PLAIN = { node: null, prompt: null } as const;

const MODEL: SheetModel = {
  sheetId: "sheet_123",
  sheetName: "Customers",
  rowCount: 100,
  columns: [
    { ...PLAIN, id: "col.0", name: "Name", type: "string" },
    { ...PLAIN, id: "col.1", name: "Age", type: "number" },
    { ...PLAIN, id: "col.2", name: "Active", type: "boolean" },
  ],
  cells: new Map(),
  rowIds: new Map(),
  nextColumnIndex: 3,
};

const idleAt = (row: number, col: number): EditorState => ({
  active: { row, col },
  anchor: { row, col },
  areas: [],
  mode: "idle",
  buffer: "",
  caret: 0,
  selection: [0, 0],
  innerScrollX: 0,
  caretVisible: true,
});

const editingAt = (row: number, col: number): EditorState => ({
  ...idleAt(row, col),
  mode: "editing",
});

/** Every draw call one body paint makes. */
function paintCalls(editor: EditorState, dpr = 1) {
  const { ctx, calls } = createRecordingContext();
  paintBody({
    ctx,
    dpr,
    viewport: VIEWPORT,
    model: MODEL,
    editor,
    palette: TEST_PALETTE,
    labels: TEST_LABELS,
    formatters: FORMATTERS,
    fonts: FONTS,
    columns: MODEL.columns,
    draggingCol: null,
  });
  return calls;
}

/** The selection ring, in content space, as the painter actually stroked it. */
function ringFor(editor: EditorState, dpr: number) {
  const stroke = paintCalls(editor, dpr).find(
    (call) => call.op === "strokeRect" && call.style === "ring",
  );
  return stroke ? { args: stroke.args } : null;
}

beforeEach(clearMetricsCache);

/**
 * The gutter is row numbers only: a row is selected by its number, and the
 * selection shows as a tinted gutter cell rather than a ticked box.
 */
describe("the gutter", () => {
  test("paints no checkbox", () => {
    const boxes = paintCalls(idleAt(0, 0)).filter(
      (call) => call.op === "strokeRect" && call.args[2] === CHECKBOX_SIZE,
    );
    expect(boxes).toHaveLength(0);
  });

  test("centres the row numbers", () => {
    const one = paintCalls(idleAt(0, 0)).find(
      (call) => call.op === "fillText:1",
    );
    expect(one?.args[0]).toBe(GUTTER_WIDTH / 2);
  });

  test("tints every row of the selection and only those", () => {
    const editor: EditorState = {
      ...idleAt(2, 0),
      anchor: { row: 4, col: 2 },
    };
    // The tint is a gutter-wide fill; the range wash is wider than the gutter.
    const tints = paintCalls(editor).filter(
      (call) =>
        call.op === "fillRect" &&
        call.style === "ring" &&
        call.args[0] === 0 &&
        (call.args[2] ?? 0) < GUTTER_WIDTH,
    );
    expect(tints.map((call) => call.args[1])).toEqual(
      [2, 3, 4].map((row) => row * ROW_HEIGHT),
    );
  });

  test("paints the selected rows' numbers full-strength and the rest muted", () => {
    const editor: EditorState = {
      ...idleAt(2, 0),
      anchor: { row: 3, col: 2 },
    };
    const numbers = textCalls(paintCalls(editor));
    const styleOf = (text: string) =>
      numbers.find((call) => call.text === text)?.style;
    expect(styleOf("3")).toBe("text");
    expect(styleOf("4")).toBe("text");
    expect(styleOf("1")).toBe("mutedText");
    expect(styleOf("5")).toBe("mutedText");
  });
});

/**
 * These assert the stroke's geometry, not the clip — the recording context
 * does not rasterise, so `clip()` is recorded and ignored. The bug being
 * pinned is arithmetic: a stroke straddles its path, so an un-inset ring puts
 * half its width outside the cell, and at column 0 or row 0 that half falls
 * outside the body clip and is never drawn.
 */
describe("the selection ring", () => {
  test("is inset by half its width at dpr 1", () => {
    // A 2px ring, so 1px in on every side, 2px off each dimension.
    const ring = ringFor(idleAt(0, 0), 1);
    expect(ring?.args).toEqual([1, 1, COL_WIDTH - 2, ROW_HEIGHT - 2]);
  });

  test("keeps its whole width inside column 0, against the gutter clip", () => {
    // Content x 0 is the clip's left edge. Inset by half, the stroke spans
    // content x 0..2 — entirely inside it.
    const ring = ringFor(idleAt(0, 0), 1);
    const left = ring?.args[0] ?? 0;
    expect(left - 1 / 2).toBeGreaterThanOrEqual(0);
  });

  test("keeps its whole width inside row 0, against the top of the canvas", () => {
    const ring = ringFor(idleAt(0, 2), 1);
    const top = ring?.args[1] ?? 0;
    expect(top - 1 / 2).toBeGreaterThanOrEqual(0);
  });

  test("is inset by half a CSS pixel at dpr 2, where the ring is 1px", () => {
    const ring = ringFor(idleAt(0, 0), 2);
    expect(ring?.args).toEqual([0.5, 0.5, COL_WIDTH - 1, ROW_HEIGHT - 1]);
  });

  test("still lands on the right cell away from the edges", () => {
    const ring = ringFor(idleAt(3, 2), 1);
    expect(ring?.args[0]).toBe(2 * COL_WIDTH + 1);
    expect(ring?.args[1]).toBe(3 * ROW_HEIGHT + 1);
  });

  test("is not drawn while a cell is being edited — the overlay owns it", () => {
    expect(ringFor(editingAt(0, 0), 1)).toBeNull();
  });
});

describe("the areas", () => {
  const picked = { rowFirst: 3, rowLast: 3, colFirst: 2, colLast: 2 };

  test("rings every earlier area, then the active cell", () => {
    const rings = paintCalls({ ...idleAt(0, 0), areas: [picked] }).filter(
      (call) => call.op === "strokeRect" && call.style === "ring",
    );
    expect(rings.map((call) => [call.args[0], call.args[1]])).toEqual([
      [2 * COL_WIDTH + 1, 3 * ROW_HEIGHT + 1],
      [1, 1],
    ]);
  });

  test("washes a picked single cell, but never the active cell alone", () => {
    const washes = (editor: EditorState) =>
      paintCalls(editor).filter(
        (call) =>
          call.op === "fillRect" &&
          call.style === "ring" &&
          call.args[2] === COL_WIDTH,
      );
    expect(washes(idleAt(0, 0))).toHaveLength(0);
    expect(washes({ ...idleAt(0, 0), areas: [picked] })).toHaveLength(1);
  });
});

describe("the editing ring", () => {
  test("is inset the same way, so switching to edit does not shift it", () => {
    const { ctx, calls } = createRecordingContext();
    paintEditor({
      ctx,
      dpr: 1,
      viewport: VIEWPORT,
      editor: editingAt(0, 0),
      palette: TEST_PALETTE,
      fonts: FONTS,
    });
    const stroke = calls.find(
      (call) => call.op === "strokeRect" && call.style === "ring",
    );
    expect(stroke?.args).toEqual([1, 1, COL_WIDTH - 2, ROW_HEIGHT - 2]);
  });
});
