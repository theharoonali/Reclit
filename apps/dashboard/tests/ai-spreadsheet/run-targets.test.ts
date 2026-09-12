import { describe, expect, test } from "bun:test";
import {
  MAX_RUN_CELLS,
  MAX_RUN_ROWS,
  planRunTargets,
  selectionRect,
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

describe("planRunTargets runnability", () => {
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
    planRunTargets([one], rect(0, 0, 0, 0), none).count;

  test("counts a search column once it has a prompt", () => {
    expect(runnableCount(search({}))).toBe(1);
    expect(runnableCount(search({ prompt: null }))).toBe(0);
  });

  test("ignores a node with no executor", () => {
    expect(
      runnableCount(column("col.9", { node: "email", prompt: "hi" })),
    ).toBe(0);
  });
});

describe("planRunTargets", () => {
  test("keeps the runnable columns of the rectangle in display order, as wire indexes", () => {
    const plan = planRunTargets(columns, rect(0, 0, 0, 3), none);
    expect(plan.columnIndexes).toEqual([3, 2]);
    expect(plan.count).toBe(2);
    expect(plan.rowIndexes).toEqual([0]);
  });

  test("maps a display position to the column's own index, not the position", () => {
    expect(
      planRunTargets(columns, rect(0, 0, 1, 1), none).columnIndexes,
    ).toEqual([3]);
  });

  test("enumerates every row of the rectangle; count is rows × runnable columns", () => {
    const plan = planRunTargets(columns, rect(4, 6, 0, 3), none);
    expect(plan.rowIndexes).toEqual([4, 5, 6]);
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
    expect(planRunTargets(columns, rect(4, 6, 0, 3), runs).busyCount).toBe(1);
  });

  test("clamps a rectangle that reaches past the last column", () => {
    expect(
      planRunTargets(columns, rect(0, 0, 2, 99), none).columnIndexes,
    ).toEqual([2]);
  });

  test("a rectangle over the caps is too large and enumerates nothing", () => {
    const huge = planRunTargets(columns, rect(0, 4_999_999, 0, 3), none);
    expect(huge.tooLarge).toBe(true);
    expect(huge.rowIndexes).toEqual([]);
    expect(huge.count).toBe(5_000_000 * 2);

    const manyCells = planRunTargets(columns, rect(0, 2999, 0, 3), none);
    expect(manyCells.count).toBeGreaterThan(MAX_RUN_CELLS);
    expect(manyCells.tooLarge).toBe(true);

    const withinRows = planRunTargets(
      columns,
      rect(0, MAX_RUN_ROWS - 1, 0, 3),
      none,
    );
    expect(withinRows.tooLarge).toBe(false);
    expect(withinRows.rowIndexes).toHaveLength(MAX_RUN_ROWS);
  });

  test("a rectangle with no runnable column has nothing to run, however tall", () => {
    const plan = planRunTargets(columns, rect(0, 4_999_999, 0, 0), none);
    expect(plan).toEqual({
      rowIndexes: [],
      columnIndexes: [],
      count: 0,
      busyCount: 0,
      tooLarge: false,
    });
  });
});
