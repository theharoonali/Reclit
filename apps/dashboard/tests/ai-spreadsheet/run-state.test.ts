import { describe, expect, test } from "bun:test";
import { applyRunChange } from "@/lib/ai-spreadsheet/run-state";
import type { ActiveRun, RunAi } from "@/lib/ai-spreadsheet/types";

const SHEET = "sheet-1";

/** A run as the contract describes it; only the fields under test vary. */
function run(over: Partial<RunAi> & { id: string }): RunAi {
  return {
    cellId: `${SHEET}.cell.0.0`,
    spreadsheetId: SHEET,
    batchId: "b",
    status: "pending",
    credit: 0,
    result: null,
    createdAt: new Date("2026-09-02T10:00:00Z"),
    updatedAt: new Date("2026-09-02T10:00:00Z"),
    ...over,
  };
}

const later = new Date("2026-09-02T11:00:00Z");
const tracked = (over: Partial<ActiveRun> = {}): ActiveRun => ({
  runId: "r1",
  status: "pending",
  createdAt: new Date("2026-09-02T10:00:00Z"),
  ...over,
});

describe("applyRunChange", () => {
  test("a snapshot replaces the map with the working runs of this sheet", () => {
    const current = new Map([["9:col.9", tracked({ runId: "stale" })]]);
    const { runs, outputs } = applyRunChange(
      current,
      {
        type: "snapshot",
        runs: [
          run({ id: "a", cellId: `${SHEET}.cell.2.1`, status: "analyzing" }),
          run({ id: "b", cellId: "other.cell.0.0" }),
          run({ id: "c", cellId: `${SHEET}.cell.3.1`, status: "completed" }),
        ],
      },
      SHEET,
    );
    expect([...runs.keys()]).toEqual(["2:col.1"]);
    expect(runs.get("2:col.1")).toMatchObject({
      runId: "a",
      status: "analyzing",
    });
    expect(outputs).toEqual([]);
  });

  test("a working run takes its cell over, keyed by column id", () => {
    const { runs } = applyRunChange(
      new Map(),
      { type: "run", run: run({ id: "r1", cellId: `${SHEET}.cell.4.2` }) },
      SHEET,
    );
    expect(runs.get("4:col.2")).toMatchObject({
      runId: "r1",
      status: "pending",
    });
  });

  test("a stage change on the tracked run updates it in place", () => {
    const current = new Map([["0:col.0", tracked()]]);
    const { runs } = applyRunChange(
      current,
      { type: "run", run: run({ id: "r1", status: "analyzing" }) },
      SHEET,
    );
    expect(runs.get("0:col.0")?.status).toBe("analyzing");
  });

  test("an older run cannot displace a newer one", () => {
    const current = new Map([
      ["0:col.0", tracked({ runId: "new", createdAt: later })],
    ]);
    const { runs } = applyRunChange(
      current,
      { type: "run", run: run({ id: "old", status: "running" }) },
      SHEET,
    );
    expect(runs.get("0:col.0")?.runId).toBe("new");
  });

  test("a completed run clears its cell and yields its output", () => {
    const current = new Map([["0:col.0", tracked()]]);
    const { runs, outputs } = applyRunChange(
      current,
      {
        type: "run",
        run: run({
          id: "r1",
          status: "completed",
          result: { output: "Hello", usage: { totalTokens: 3 } },
        }),
      },
      SHEET,
    );
    expect(runs.size).toBe(0);
    expect(outputs).toEqual([{ row: 0, columnId: "col.0", value: "Hello" }]);
  });

  test("a completed run without a usable output only clears", () => {
    const current = new Map([["0:col.0", tracked()]]);
    const noOutput = applyRunChange(
      current,
      {
        type: "run",
        run: run({ id: "r1", status: "completed", result: { text: "x" } }),
      },
      SHEET,
    );
    expect(noOutput.runs.size).toBe(0);
    expect(noOutput.outputs).toEqual([]);
    const nullOutput = applyRunChange(
      current,
      {
        type: "run",
        run: run({ id: "r1", status: "completed", result: { output: null } }),
      },
      SHEET,
    );
    expect(nullOutput.outputs).toEqual([]);
  });

  test("a failed run clears its cell and yields nothing", () => {
    const current = new Map([["0:col.0", tracked()]]);
    const { runs, outputs } = applyRunChange(
      current,
      {
        type: "run",
        run: run({ id: "r1", status: "failed", result: { output: "ignored" } }),
      },
      SHEET,
    );
    expect(runs.size).toBe(0);
    expect(outputs).toEqual([]);
  });

  test("a terminal event for an untracked cell (replay) still yields its output", () => {
    const { runs, outputs } = applyRunChange(
      new Map(),
      {
        type: "run",
        run: run({ id: "r1", status: "completed", result: { output: 42 } }),
      },
      SHEET,
    );
    expect(runs.size).toBe(0);
    expect(outputs).toEqual([{ row: 0, columnId: "col.0", value: 42 }]);
  });

  test("an old terminal event cannot clear a newer working run", () => {
    const current = new Map([
      ["0:col.0", tracked({ runId: "new", createdAt: later })],
    ]);
    const { runs, outputs } = applyRunChange(
      current,
      {
        type: "run",
        run: run({
          id: "old",
          status: "completed",
          result: { output: "stale" },
        }),
      },
      SHEET,
    );
    expect(runs.get("0:col.0")?.runId).toBe("new");
    expect(outputs).toEqual([]);
  });

  test("a run from another sheet changes nothing", () => {
    const current = new Map([["0:col.0", tracked()]]);
    const { runs, outputs } = applyRunChange(
      current,
      {
        type: "run",
        run: run({ id: "x", cellId: "other.cell.0.0", status: "completed" }),
      },
      SHEET,
    );
    expect(runs.get("0:col.0")?.runId).toBe("r1");
    expect(outputs).toEqual([]);
  });
});

describe("applyRunChange: closed", () => {
  test("a closed session empties the map and yields nothing", () => {
    const current = new Map([["0:col.0", tracked()]]);
    const { runs, outputs } = applyRunChange(
      current,
      { type: "closed" },
      SHEET,
    );
    expect(runs.size).toBe(0);
    expect(outputs).toEqual([]);
  });
});
