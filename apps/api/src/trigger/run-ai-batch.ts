import { logger, schemaTask } from "@trigger.dev/sdk";
import { describeError } from "../common/errors";
import { RunAiFinishedError } from "../modules/run-ai/run-ai.errors";
import type {
  RunAiJobPayload,
  RunAiWave,
} from "../modules/run-ai/run-ai.schema";
import { runAiBatchJobSchema } from "../modules/run-ai/run-ai.schema";
import { runAiService } from "../modules/run-ai/run-ai.service";
import { runAiBatchService } from "../modules/run-ai/run-ai-batch.service";
import { runAiCellTask } from "./run-ai-cell";

// The skeleton of a Run click. The API recorded every run of the batch as
// `pending` and grouped them into column waves (one per AI column, in the
// sheet's sort order). This task walks the waves: for each one it prepares
// the input of every cell — the row as the database holds it *now*, so the
// answers of the earlier columns are in it, plus the row's previous answer
// named as `previous` — then runs the wave as one Trigger.dev batch of
// `run-ai-cell`, or as a single run when the wave has one cell, and waits.
//
// Each row is a series: a cell that fails stops its row, and the row's cells
// in the later waves are failed with the reason without running. Other rows
// go on. Every write on that path is `failPending` — a guarded update that
// never touches a terminal row — so a crash of this task, or its
// `onFailure`, can never revive or overwrite a completed step. No retries: a
// retry would re-run cells that already finished.

type WaveCell = RunAiWave["cells"][number];
type WaveItem = { cell: WaveCell; payload: RunAiJobPayload };
/** What `triggerAndWait` and `batchTriggerAndWait` both hand back per run. */
type CellOutcome = { ok: boolean; output?: unknown };

const seriesStopped = (column: string) => ({
  error: {
    name: "RunAiSeriesStopped",
    message: `previous step "${column}" failed`,
  },
});

/** The cell task returns `{ runId, status }`; only `completed` lets the row go on. */
const isCompleted = (output: unknown): boolean =>
  typeof output === "object" &&
  output !== null &&
  (output as { status?: unknown }).status === "completed";

/** Builds every live cell's input; a cell that cannot be prepared stops its row. */
async function prepareWave(
  wave: RunAiWave,
  cells: WaveCell[],
  lastRunIdByRow: Map<number, string>,
  stoppedBy: Map<number, string>,
): Promise<WaveItem[]> {
  const items: WaveItem[] = [];
  for (const cell of cells) {
    try {
      const { input } = await runAiBatchService.prepare(
        cell.runId,
        lastRunIdByRow.get(cell.rowIndex),
      );
      items.push({ cell, payload: { runId: cell.runId, input } });
    } catch (error) {
      const failure = describeError(error);
      logger.error("cell could not be prepared", {
        runId: cell.runId,
        column: wave.columnName,
        ...failure,
      });
      // A run the API already finished keeps its own reason.
      if (!(error instanceof RunAiFinishedError)) {
        await runAiService.failPending([cell.runId], { error: failure });
      }
      stoppedBy.set(cell.rowIndex, wave.columnName);
    }
  }
  return items;
}

/** One cell is a single run; more are one batch. Both are waited for. */
async function runWave(items: WaveItem[]): Promise<CellOutcome[]> {
  const [only] = items;
  if (items.length === 1 && only) {
    const result = await runAiCellTask.triggerAndWait(only.payload, {
      idempotencyKey: only.payload.runId,
    });
    return [result];
  }
  const { runs } = await runAiCellTask.batchTriggerAndWait(
    items.map(({ payload }) => ({
      payload,
      options: { idempotencyKey: payload.runId },
    })),
  );
  return runs;
}

export const runAiBatchTask = schemaTask({
  id: "run-ai-batch",
  schema: runAiBatchJobSchema,
  retry: { maxAttempts: 1 },
  run: async ({ batchId, waves }) => {
    /** The last completed run of each row — the `previous` of its next cell. */
    const lastRunIdByRow = new Map<number, string>();
    /** Rows whose series stopped, with the column that stopped them. */
    const stoppedBy = new Map<number, string>();
    let completed = 0;

    for (const wave of waves) {
      const skipped = wave.cells.filter((cell) => stoppedBy.has(cell.rowIndex));
      for (const cell of skipped) {
        await runAiService.failPending(
          [cell.runId],
          seriesStopped(stoppedBy.get(cell.rowIndex) ?? ""),
        );
      }
      const live = wave.cells.filter((cell) => !stoppedBy.has(cell.rowIndex));
      const items = await prepareWave(wave, live, lastRunIdByRow, stoppedBy);
      logger.info("wave", {
        batchId,
        column: wave.columnName,
        cells: items.length,
        skipped: skipped.length,
        mode: items.length === 1 ? "single" : "batch",
      });
      if (items.length === 0) continue;

      const outcomes = await runWave(items);
      if (outcomes.length !== items.length) {
        logger.error("wave returned a different number of runs", {
          batchId,
          column: wave.columnName,
          expected: items.length,
          received: outcomes.length,
        });
      }
      items.forEach((item, position) => {
        const outcome = outcomes[position];
        if (outcome?.ok && isCompleted(outcome.output)) {
          lastRunIdByRow.set(item.cell.rowIndex, item.cell.runId);
          completed += 1;
          return;
        }
        stoppedBy.set(item.cell.rowIndex, wave.columnName);
      });
    }

    return { batchId, completed, stoppedRows: stoppedBy.size };
  },
  onFailure: async ({ payload, error }) => {
    // The task itself died: whatever is still working is failed with the
    // reason. Guarded, so every completed cell keeps its value.
    await runAiService
      .failPending(
        payload.waves.flatMap((wave) => wave.cells.map((cell) => cell.runId)),
        { error: describeError(error) },
      )
      .catch(() => {});
  },
});
