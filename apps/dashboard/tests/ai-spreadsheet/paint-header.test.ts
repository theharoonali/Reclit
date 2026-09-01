import { beforeEach, describe, expect, test } from "bun:test";
import { previewOrder } from "@/lib/ai-spreadsheet/column-order";
import { COL_WIDTH, HEADER_HEIGHT } from "@/lib/ai-spreadsheet/geometry";
import { paintHeader } from "@/lib/ai-spreadsheet/paint-header";
import { clearMetricsCache } from "@/lib/ai-spreadsheet/text-metrics";
import type {
  SheetColumn,
  SheetFonts,
  SheetHit,
  SheetLabels,
  Viewport,
} from "@/lib/ai-spreadsheet/types";
import {
  createRecordingContext,
  type DrawCall,
  TEST_LABELS,
  TEST_PALETTE,
} from "../support/canvas";

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

const COLUMNS: SheetColumn[] = [
  { id: "col.0", name: "Name", type: "string", node: null, prompt: null },
  { id: "col.1", name: "Age", type: "number", node: null, prompt: null },
  { id: "col.2", name: "Active", type: "boolean", node: null, prompt: null },
];

// The painter looks every type name up, so an empty map would paint undefined.
const LABELS: SheetLabels = {
  ...TEST_LABELS,
  typeNames: {
    string: "Text",
    number: "Number",
    boolean: "Boolean",
    date: "Date",
    json: "JSON",
    formula: "Formula",
    audio: "Audio",
    file: "File",
    email: "Email",
    url: "URL",
  },
};

function paint(
  options: {
    hover?: SheetHit;
    columns?: SheetColumn[];
    draggingCol?: number | null;
  } = {},
) {
  const { ctx, calls } = createRecordingContext();
  paintHeader({
    ctx,
    dpr: 2,
    viewport: VIEWPORT,
    columns: options.columns ?? COLUMNS,
    palette: TEST_PALETTE,
    labels: LABELS,
    fonts: FONTS,
    hover: options.hover ?? { kind: "empty" },
    draggingCol: options.draggingCol ?? null,
    selectAll: "none",
    stripWidth: 800,
  });
  return calls;
}

/** Names, in the order the painter laid them down. */
const names = (calls: DrawCall[]) =>
  calls
    .filter((call) => call.op.startsWith("fillText:"))
    .map((call) => call.op.slice("fillText:".length))
    .filter((text) => COLUMNS.some((column) => column.name === text));

/** The grip's dots: small square fills in `mutedText`. */
const gripDots = (calls: DrawCall[]) =>
  calls.filter(
    (call) =>
      call.op === "fillRect" &&
      call.style === "mutedText" &&
      call.args[2] === 2 &&
      call.args[3] === 2,
  );

beforeEach(clearMetricsCache);

describe("paintHeader drag preview", () => {
  test("paints every column's name while nothing is dragging", () => {
    expect(names(paint())).toEqual(["Name", "Age", "Active"]);
  });

  // The dragged column is on the pointer, so its slot is an empty well — the
  // gap the others opened around it is what shows where the drop lands.
  test("leaves the dragged column's slot empty", () => {
    const preview = previewOrder(COLUMNS, 0, 2);
    expect(names(paint({ columns: preview, draggingCol: 2 }))).toEqual([
      "Age",
      "Active",
    ]);
  });

  test("tints the empty slot so the landing place reads", () => {
    const wells = paint({
      columns: previewOrder(COLUMNS, 0, 2),
      draggingCol: 2,
    }).filter(
      (call) =>
        call.op === "fillRect" &&
        call.args[2] === COL_WIDTH &&
        call.args[3] === HEADER_HEIGHT,
    );
    expect(wells).toHaveLength(1);
    expect(wells[0]?.args[0]).toBe(2 * COL_WIDTH);
  });

  test("draws no orange insertion line", () => {
    const calls = paint({
      columns: previewOrder(COLUMNS, 0, 2),
      draggingCol: 2,
    });
    const thin = calls.filter(
      (call) =>
        call.op === "fillRect" &&
        call.style === "ring" &&
        (call.args[2] ?? 0) <= 4,
    );
    expect(thin).toHaveLength(0);
  });
});

describe("paintHeader grip", () => {
  test("stays hidden until the column is hovered", () => {
    expect(gripDots(paint())).toHaveLength(0);
  });

  test("paints six dots on the hovered column only", () => {
    const dots = gripDots(paint({ hover: { kind: "header", col: 1 } }));
    expect(dots).toHaveLength(6);
    // All of them inside column 1.
    for (const dot of dots) {
      expect(dot.args[0]).toBeGreaterThanOrEqual(COL_WIDTH);
      expect(dot.args[0]).toBeLessThan(2 * COL_WIDTH);
    }
  });

  test("stays lit while the pointer is on the grip itself", () => {
    expect(
      gripDots(paint({ hover: { kind: "header-grip", col: 0 } })),
    ).toHaveLength(6);
  });

  // The dragged column paints as an empty well, so it has no grip either.
  test("is absent from the dragged column's empty slot", () => {
    const dots = gripDots(
      paint({ columns: previewOrder(COLUMNS, 0, 2), draggingCol: 2 }),
    );
    expect(dots).toHaveLength(0);
  });
});

describe("paintHeader names", () => {
  // The grip's lane is reserved on every column, hovered or not, so revealing
  // it must not shove the name sideways.
  test("paints the name at the same x hovered and not", () => {
    const nameOf = (calls: DrawCall[]) =>
      calls.find((call) => call.op === "fillText:Name");
    expect(nameOf(paint({ hover: { kind: "header", col: 0 } }))?.args[0]).toBe(
      nameOf(paint())?.args[0],
    );
  });
});
