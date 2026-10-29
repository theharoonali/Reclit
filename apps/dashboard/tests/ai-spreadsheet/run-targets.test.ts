import { describe, expect, test } from "bun:test";
import {
  MAX_RUN_CELLS,
  MAX_RUN_ROWS,
  planRunBatches,
  selectionRect,
  selectionRects,
} from "@/lib/ai-spreadsheet/run-targets";
import type { ActiveRun, SheetColumn } from "@/lib/ai-spreadsheet/types";

const column = (id: string, over: Partial<SheetColumn> = {}): SheetColumn => ({
  id,
  name: id,
  type: "string",
  node: null,
  prompt: null,
  ...over,
});
const ai = (id: string, name: string) =>
  column(id, { name, node: "ai", prompt: "Go." });

// Display order: a plain column, an AI column, an AI node without a prompt,
// another AI column — with wire indexes that disagree with the positions.
const columns: SheetColumn[] = [
  column("col.0"),
  ai("col.3", "Summary"),
  column("col.1", { node: "ai" }),
  ai("col.2", "Tone"),
];

const working: ActiveRun = {
  runId: "r",
  status: "running",
  createdAt: new Date("2026-09-06T10:00:00Z"),
};
const none = new Map<string, ActiveRun>();
const rect = (
  rowFirst: number,
  rowLast: number,
  colFirst: number,
  colLast: number,
) => ({ rowFirst, rowLast, colFirst, colLast });

describe("selectionRect", () => {
  test("normalises anchor and active in either direction", () => {
    expect(selectionRect({ row: 5, col: 1 }, { row: 2, col: 3 })).toEqual(
      rect(2, 5, 1, 3),
    );
    expect(selectionRect({ row: 2, col: 3 }, { row: 5, col: 1 })).toEqual(
      rect(2, 5, 1, 3),
    );
  });

  test("collapses to the active cell without an anchor", () => {
    expect(selectionRect({ row: 4, col: 2 }, null)).toEqual(rect(4, 4, 2, 2));
  });
});

describe("selectionRects", () => {
  test("is the earlier areas, then the current rectangle", () => {
    const area = rect(0, 0, 1, 1);
    expect(
      selectionRects({
        active: { row: 4, col: 2 },
        anchor: { row: 2, col: 3 },
        areas: [area],
      }),
    ).toEqual([area, rect(2, 4, 2, 3)]);
  });

  test("is empty without an active cell", () => {
    expect(selectionRects({ active: null, anchor: null, areas: [] })).toEqual(
      [],
    );
  });
});

describe("planRunBatches runnability", () => {
  // A Google Search column is runnable exactly like an AI one: the prompt is
  // its whole configuration. Mirrors `isRunnable` in the API's
  // run-ai-batch.service.ts.
  const search = (over: Partial<SheetColumn>) =>
    column("col.9", {
      name: "Domain",
      node: "google_search",
      prompt: "the domain",
      ...over,
    });

  const runnableCount = (one: SheetColumn) =>
    planRunBatches([one], [rect(0, 0, 0, 0)], none).count;

  test("counts a search column once it has a prompt", () => {
    expect(runnableCount(search({}))).toBe(1);
    expect(runnableCount(search({ prompt: null }))).toBe(0);
  });

  test("counts a mail column with a prompt on a JSON column only", () => {
    const mail = (over: Partial<SheetColumn>) =>
      column("col.9", { node: "email", prompt: "Say hi", ...over });
    expect(runnableCount(mail({ type: "json" }))).toBe(1);
    // A legacy string Mail column (predating the json rule) is skipped.
    expect(runnableCount(mail({ type: "string" }))).toBe(0);
    expect(runnableCount(mail({ type: "number" }))).toBe(0);
    expect(runnableCount(mail({ prompt: null }))).toBe(0);
  });
});

describe("planRunBatches over one rectangle", () => {
  test("keeps the runnable columns of the rectangle in display order, as wire indexes", () => {
    const plan = planRunBatches(columns, [rect(0, 0, 0, 3)], none);
    expect(plan.batches).toEqual([{ rowIndexes: [0], columnIndexes: [3, 2] }]);
    expect(plan.count).toBe(2);
  });

  test("maps a display position to the column's own index, not the position", () => {
    expect(
      planRunBatches(columns, [rect(0, 0, 1, 1)], none).batches[0]
        ?.columnIndexes,
    ).toEqual([3]);
  });

  test("enumerates every row of the rectangle in one batch; count is rows × runnable columns", () => {
    const plan = planRunBatches(columns, [rect(4, 6, 0, 3)], none);
    expect(plan.batches).toEqual([
      { rowIndexes: [4, 5, 6], columnIndexes: [3, 2] },
    ]);
    expect(plan.count).toBe(6);
    expect(plan.busyCount).toBe(0);
    expect(plan.tooLarge).toBe(false);
  });

  test("counts working runs inside the rectangle only, and only on runnable columns", () => {
    const runs = new Map<string, ActiveRun>([
      ["5:col.3", working], // inside: a runnable cell
      ["9:col.3", working], // outside the rows
      ["5:col.0", working], // inside, but a plain column
    ]);
    expect(planRunBatches(columns, [rect(4, 6, 0, 3)], runs).busyCount).toBe(1);
  });

  test("clamps a rectangle that reaches past the last column", () => {
    expect(
      planRunBatches(columns, [rect(0, 0, 2, 99)], none).batches[0]
        ?.columnIndexes,
    ).toEqual([2]);
  });

  test("a rectangle over the caps is too large and enumerates nothing", () => {
    const huge = planRunBatches(columns, [rect(0, 4_999_999, 0, 3)], none);
    expect(huge.tooLarge).toBe(true);
    expect(huge.batches).toEqual([]);
    expect(huge.count).toBe(5_000_000 * 2);

    const manyCells = planRunBatches(columns, [rect(0, 2999, 0, 3)], none);
    expect(manyCells.count).toBeGreaterThan(MAX_RUN_CELLS);
    expect(manyCells.tooLarge).toBe(true);

    const withinRows = planRunBatches(
      columns,
      [rect(0, MAX_RUN_ROWS - 1, 0, 3)],
      none,
    );
    expect(withinRows.tooLarge).toBe(false);
    expect(withinRows.batches[0]?.rowIndexes).toHaveLength(MAX_RUN_ROWS);
  });

  test("a rectangle with no runnable column has nothing to run, however tall", () => {
    const plan = planRunBatches(columns, [rect(0, 4_999_999, 0, 0)], none);
    expect(plan).toEqual({
      batches: [],
      count: 0,
      busyCount: 0,
      tooLarge: false,
    });
  });
});

describe("planRunBatches over several areas", () => {
  test("merges areas with the same columns into one batch, each cell once", () => {
    // Two picks in Summary, plus a rectangle overlapping the first pick.
    const plan = planRunBatches(
      columns,
      [rect(2, 2, 1, 1), rect(5, 5, 1, 1), rect(1, 2, 1, 1)],
      none,
    );
    expect(plan.batches).toEqual([
      { rowIndexes: [1, 2, 5], columnIndexes: [3] },
    ]);
    expect(plan.count).toBe(3);
  });

  test("splits rows with different column sets into their own batches, in row order", () => {
    const plan = planRunBatches(
      columns,
      [rect(0, 1, 0, 3), rect(2, 2, 3, 3)],
      none,
    );
    expect(plan.batches).toEqual([
      { rowIndexes: [0, 1], columnIndexes: [3, 2] },
      { rowIndexes: [2], columnIndexes: [2] },
    ]);
    expect(plan.count).toBe(5);
  });

  test("keeps a row's columns together when two areas meet on it", () => {
    // Row 3 is in both: Summary from the first area, Tone from the second.
    const plan = planRunBatches(
      columns,
      [rect(3, 3, 1, 1), rect(3, 4, 3, 3)],
      none,
    );
    expect(plan.batches).toEqual([
      { rowIndexes: [3], columnIndexes: [3, 2] },
      { rowIndexes: [4], columnIndexes: [2] },
    ]);
  });

  test("counts a working run once, whichever areas hold its cell", () => {
    const runs = new Map<string, ActiveRun>([["2:col.3", working]]);
    expect(
      planRunBatches(columns, [rect(2, 2, 1, 1), rect(1, 3, 1, 1)], runs)
        .busyCount,
    ).toBe(1);
  });

  test("judges size over the union of rows and the sum of cells", () => {
    const tall = planRunBatches(
      columns,
      [rect(0, 999, 1, 1), rect(500, 1500, 1, 1)],
      none,
    );
    expect(tall.tooLarge).toBe(true);

    // The same thousand rows twice: 2,000 cells on paper, 1,000 to send.
    const twice = planRunBatches(
      columns,
      [rect(0, 999, 1, 1), rect(0, 999, 1, 1)],
      none,
    );
    expect(twice.tooLarge).toBe(false);
    expect(twice.count).toBe(1000);
    expect(twice.batches).toHaveLength(1);
  });
});
