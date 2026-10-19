import { describe, expect, test } from "bun:test";
import type { RunAi, RunAiChange } from "@/lib/ai-spreadsheet/types";
import {
  applyOutputChange,
  formatOutputValue,
  isOutputWorking,
  seedOutputs,
  waitingOutputs,
} from "@/lib/public-form-output";

const sheet = "sheet-1";
const row = { sheetId: sheet, rowIndex: 7 };
const outputs = [
  { columnIndex: 3, type: "string" },
  { columnIndex: 5, type: "number" },
];

const run = (
  col: number,
  status: string,
  over: Partial<RunAi> = {},
  rowIndex = 7,
): RunAi =>
  ({
    id: `run-${col}-${status}`,
    cellId: `${sheet}.cell.${rowIndex}.${col}`,
    spreadsheetId: sheet,
    batchId: "batch-1",
    status,
    credit: 0,
    result: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as RunAi;

const statuses = (state: ReturnType<typeof seedOutputs>) =>
  [...state].map(([col, cell]) => `${col}:${cell.status}`);

describe("public form output", () => {
  test("waits for a submission, then works where a run exists and skips the rest", () => {
    expect(statuses(waitingOutputs(outputs))).toEqual([
      "3:waiting",
      "5:waiting",
    ]);
    const seeded = seedOutputs(outputs, [run(3, "pending")], row);
    expect(statuses(seeded)).toEqual(["3:working", "5:skipped"]);
    expect(seeded.get(3)?.stage).toBe("pending");
    expect(isOutputWorking(seeded)).toBe(true);
  });

  test("ignores runs of other rows and sheets", () => {
    const seeded = seedOutputs(outputs, [run(3, "pending")], row);
    const other: RunAiChange = { type: "run", run: run(3, "completed", {}, 8) };
    expect(applyOutputChange(seeded, other, row)).toBe(seeded);
  });

  test("folds a completed run into its value and a failed one into failed", () => {
    const seeded = seedOutputs(
      outputs,
      [run(3, "pending"), run(5, "pending")],
      row,
    );
    const done = applyOutputChange(
      seeded,
      {
        type: "run",
        run: run(3, "completed", {
          result: { output: "Senior" },
        } as Partial<RunAi>),
      },
      row,
    );
    expect(done.get(3)).toEqual({ status: "done", value: "Senior" });
    const failed = applyOutputChange(
      done,
      { type: "run", run: run(5, "failed") },
      row,
    );
    expect(failed.get(5)).toEqual({ status: "failed" });
    expect(isOutputWorking(failed)).toBe(false);
  });

  test("a snapshot updates every matching cell and closed fails what is still working", () => {
    const seeded = seedOutputs(
      outputs,
      [run(3, "pending"), run(5, "pending")],
      row,
    );
    const snap = applyOutputChange(
      seeded,
      { type: "snapshot", runs: [run(3, "running"), run(5, "analyzing")] },
      row,
    );
    expect(snap.get(3)?.stage).toBe("running");
    expect(snap.get(5)?.stage).toBe("analyzing");
    const closed = applyOutputChange(snap, { type: "closed" }, row);
    expect(statuses(closed)).toEqual(["3:failed", "5:failed"]);
  });

  test("formats values by type", () => {
    expect(formatOutputValue("Senior", "string")).toEqual({
      text: "Senior",
      mono: false,
      bool: null,
    });
    expect(formatOutputValue(true, "boolean").bool).toBe(true);
    expect(formatOutputValue({ a: 1 }, "json")).toEqual({
      text: '{\n  "a": 1\n}',
      mono: true,
      bool: null,
    });
    expect(formatOutputValue("2026-01-05T00:00:00.000Z", "date").text).toBe(
      "2026-01-05",
    );
    expect(formatOutputValue(null, "number").text).toBe("");
  });
});
