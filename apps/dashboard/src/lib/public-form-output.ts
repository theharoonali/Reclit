import { isTerminalRunStatus } from "@/lib/ai-spreadsheet/run-status";
import { parseScopedCellId } from "@/lib/ai-spreadsheet/short-ids";
import type { CellValue, RunAi, RunAiChange } from "@/lib/ai-spreadsheet/types";

/**
 * The public form's output column: one cell per AI column of the row the
 * visitor submitted, folded from the submit response and the sheet's run
 * stream. Pure — the hook holds the state, these shape it.
 */
export type OutputStatus =
  | "waiting"
  | "working"
  | "done"
  | "failed"
  | "skipped";

export type OutputCell = {
  status: OutputStatus;
  /** The run's stage while working (`pending`, `running`, a custom stage). */
  stage?: string;
  value?: CellValue;
};

export type OutputState = ReadonlyMap<number, OutputCell>;

export type OutputColumn = { columnIndex: number; type: string };

/** The row to follow: the sheet and the index the submission landed on. */
export type OutputRow = { sheetId: string; rowIndex: number };

const isCellValue = (value: unknown): value is CellValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean" ||
  (typeof value === "object" && !Array.isArray(value));

/** The column a run belongs to, when it is on the followed row. */
function columnOf(run: RunAi, row: OutputRow): number | null {
  const address = parseScopedCellId(run.cellId);
  if (!address || address.sheetId !== row.sheetId) return null;
  return address.row === row.rowIndex ? address.col : null;
}

function fromRun(run: RunAi): OutputCell {
  if (run.status === "completed") {
    const output = run.result?.output;
    return { status: "done", value: isCellValue(output) ? output : null };
  }
  if (isTerminalRunStatus(run.status)) return { status: "failed" };
  return { status: "working", stage: run.status };
}

/** Before any submission: every output column waits. */
export function waitingOutputs(outputs: readonly OutputColumn[]): OutputState {
  return new Map(
    outputs.map((output) => [output.columnIndex, { status: "waiting" }]),
  );
}

/**
 * Right after a submission: each column with a run in the response is
 * working (the runs are `pending`), one without is skipped — the sheet had
 * no runnable column there, or starting the runs failed (`runError`).
 */
export function seedOutputs(
  outputs: readonly OutputColumn[],
  runs: readonly RunAi[],
  row: OutputRow,
): OutputState {
  const byColumn = new Map<number, RunAi>();
  for (const run of runs) {
    const column = columnOf(run, row);
    if (column !== null) byColumn.set(column, run);
  }
  return new Map(
    outputs.map((output) => {
      const run = byColumn.get(output.columnIndex);
      return [output.columnIndex, run ? fromRun(run) : { status: "skipped" }];
    }),
  );
}

/**
 * One stream event folded in. Runs of other rows are ignored; a `closed`
 * stream with a cell still working means its run ended without a report, so
 * the cell is failed rather than left spinning.
 */
export function applyOutputChange(
  state: OutputState,
  change: RunAiChange,
  row: OutputRow,
): OutputState {
  if (change.type === "closed") {
    return new Map(
      [...state].map(([column, cell]) => [
        column,
        cell.status === "working" ? { status: "failed" } : cell,
      ]),
    );
  }
  const runs = change.type === "snapshot" ? change.runs : [change.run];
  let next: Map<number, OutputCell> | null = null;
  for (const run of runs) {
    const column = columnOf(run, row);
    if (column === null || !state.has(column)) continue;
    next ??= new Map(state);
    next.set(column, fromRun(run));
  }
  return next ?? state;
}

export const isOutputWorking = (state: OutputState): boolean =>
  [...state.values()].some((cell) => cell.status === "working");

/** A done cell's value as text, and whether it reads as code. */
export function formatOutputValue(
  value: CellValue | undefined,
  type: string,
): { text: string; mono: boolean; bool: boolean | null } {
  if (value === null || value === undefined) {
    return { text: "", mono: false, bool: null };
  }
  if (typeof value === "boolean") return { text: "", mono: false, bool: value };
  if (typeof value === "object") {
    return { text: JSON.stringify(value, null, 2), mono: true, bool: null };
  }
  if (type === "date" && typeof value === "string") {
    return { text: value.slice(0, 10), mono: false, bool: null };
  }
  return { text: String(value), mono: false, bool: null };
}
