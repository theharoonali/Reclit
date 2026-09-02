import { isTerminalRunStatus } from "./run-status";
import { parseScopedCellId } from "./short-ids";
import type { ActiveRun, CellValue, RunAi, RunAiChange } from "./types";
import { cellKey } from "./types";

/**
 * The working runs of a sheet, keyed like `SheetModel.cells` (`row:columnId`),
 * folded from the `runAi.onChange` stream. Pure so the rules can be tested
 * without a subscription in hand:
 *
 * - A `snapshot` replaces the whole map — it is the server's word on what is
 *   working right now, sent on every (re)connect. `closed` empties it.
 * - A working `run` takes a cell over unless the cell already tracks a newer
 *   run (events can be repeated on reconnect; `createdAt` breaks the tie).
 * - A terminal `run` clears its cell when it is the run being tracked or a
 *   newer one, and a `completed` run whose `result.output` is a cell value
 *   also yields that value for the cell. `failed` yields nothing.
 */

export type RunOutput = { row: number; columnId: string; value: CellValue };

export type RunStateUpdate = {
  runs: Map<string, ActiveRun>;
  outputs: RunOutput[];
};

const isCellValue = (value: unknown): value is Exclude<CellValue, null> =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean" ||
  (typeof value === "object" && value !== null && !Array.isArray(value));

const toActive = (run: RunAi): ActiveRun => ({
  runId: run.id,
  status: run.status,
  createdAt: run.createdAt,
});

export function applyRunChange(
  current: ReadonlyMap<string, ActiveRun>,
  change: RunAiChange,
  sheetId: string,
): RunStateUpdate {
  // The session ended: nothing is listening any more, so nothing is working.
  if (change.type === "closed") return { runs: new Map(), outputs: [] };

  if (change.type === "snapshot") {
    const runs = new Map<string, ActiveRun>();
    for (const run of change.runs) {
      const address = parseScopedCellId(run.cellId);
      if (!address || address.sheetId !== sheetId) continue;
      if (isTerminalRunStatus(run.status)) continue;
      runs.set(cellKey(address.row, `col.${address.col}`), toActive(run));
    }
    return { runs, outputs: [] };
  }

  const { run } = change;
  const address = parseScopedCellId(run.cellId);
  if (!address || address.sheetId !== sheetId) {
    return { runs: new Map(current), outputs: [] };
  }
  const columnId = `col.${address.col}`;
  const key = cellKey(address.row, columnId);
  const tracked = current.get(key);
  const runs = new Map(current);

  if (isTerminalRunStatus(run.status)) {
    const supersedes =
      tracked === undefined ||
      tracked.runId === run.id ||
      tracked.createdAt.getTime() <= run.createdAt.getTime();
    if (supersedes) runs.delete(key);
    const output = run.status === "completed" ? run.result?.output : undefined;
    const outputs: RunOutput[] =
      supersedes && isCellValue(output)
        ? [{ row: address.row, columnId, value: output }]
        : [];
    return { runs, outputs };
  }

  const newer =
    tracked === undefined ||
    tracked.runId === run.id ||
    tracked.createdAt.getTime() <= run.createdAt.getTime();
  if (newer) runs.set(key, toActive(run));
  return { runs, outputs: [] };
}
