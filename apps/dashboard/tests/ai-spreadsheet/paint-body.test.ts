import { beforeEach, describe, expect, test } from "bun:test";
import { createFormatters } from "@/lib/ai-spreadsheet/cell-format";
import { COL_WIDTH, ROW_HEIGHT } from "@/lib/ai-spreadsheet/geometry";
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

const MODEL: SheetModel = {
  sheetId: "sheet_123",
  sheetName: "Customers",
  rowCount: 100,
  columns: [
    { id: "col.0", name: "Name", type: "string", node: null, prompt: null },
    { id: "col.1", name: "Age", type: "number", node: null, prompt: null },
    { id: "col.2", name: "Active", type: "boolean", node: null, prompt: null },
  ],
  cells: new Map(),
  rowIds: new Map(),
  nextColumnIndex: 3,
};

const idleAt = (row: number, col: number): EditorState => ({
  active: { row, col },
  anchor: { row, col },
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

/** The selection ring, in content space, as the painter actually stroked it. */
function ringFor(editor: EditorState, dpr: number) {
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
    selected: new Set<number>(),
    columns: MODEL.columns,
    draggingCol: null,
  });
  const stroke = calls.find(
    (call) => call.op === "strokeRect" && call.style === "ring",
  );
  return stroke ? { args: stroke.args } : null;
}

beforeEach(clearMetricsCache);

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
