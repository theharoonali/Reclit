import { describeError } from "../../common/errors";
import {
  cellId,
  parseCellId,
  shortColumnId,
  shortRowId,
} from "../spreadsheet/spreadsheet.ids";
import {
  toWireColumnType,
  toWireNodeType,
} from "../spreadsheet/spreadsheet.schema";
import { spreadsheetService } from "../spreadsheet/spreadsheet.service";
import type { ColumnRecord } from "../spreadsheet/spreadsheet.shape";
import { buildRowCells, toNodeConfig } from "../spreadsheet/spreadsheet.shape";
import {
  RunAiBatchTooLargeError,
  RunAiCellBusyError,
  RunAiColumnNotRunnableError,
  RunAiDispatchError,
  RunAiFinishedError,
  RunAiInvalidCellIdError,
  RunAiNoSearchInputError,
} from "./run-ai.errors";
import type {
  RunAi,
  RunAiBatchJob,
  RunAiCellsInput,
  RunAiInput,
  RunAiInputCell,
  RunAiWave,
} from "./run-ai.schema";
import { isTerminalRunAiStatus, MAX_RUN_AI_BATCH_CELLS } from "./run-ai.schema";
import { runAiService } from "./run-ai.service";

// Framework-free (docs/rules/BACKEND.md hard rule 1). Which cells a Run click
// runs and in what order: `runCells` records the batch — one pending run per
// selected row and runnable node column — and hands the worker its column
// waves through the dispatcher hook; `prepare` builds one cell's input right
// before its wave runs, so a later column sees the answers of the earlier
// ones, and how much of the row that input holds is the node's own rule.
// Reads and writes go through runAiService and spreadsheetService; nothing
// here touches prisma.

/**
 * Asks the worker to execute a batch. Registered by src/jobs/run-ai-dispatch.ts
 * (the only importer of @trigger.dev/sdk) from src/main.ts — this graph is
 * transpiled by the dashboard and may not import the SDK itself. Without one
 * (tests) the runs stay `pending`.
 */
export type RunAiDispatcher = (batch: RunAiBatchJob) => Promise<void>;

/**
 * A column Run executes. `node` stays the database's uppercase word — the
 * whole service reads it through `toWireNodeType` — so the guarantee this
 * type carries is only "has a node and a prompt"; what else a given node
 * needs is `isRunnable`'s business.
 */
type RunnableColumn = ColumnRecord & { node: string; prompt: string };

/** One cell the batch will run, in series order: row ascending, then column sort order. */
type Target = { rowIndex: number; column: RunnableColumn; cellId: string };

/**
 * Which columns a Run click executes. Every runnable node needs a prompt (the
 * instruction); a Google Search node needs source columns on top, because
 * without them there is nothing to search for. A column that is *configured*
 * short is skipped silently, exactly as a promptless AI column is — it is a
 * half-finished column, not a client error.
 */
function isRunnable(column: ColumnRecord): column is RunnableColumn {
  if (column.node === null || column.prompt === null) return false;
  switch (toWireNodeType(column.node)) {
    case "ai":
      return true;
    case "google_search":
      return sourceColumnsOf(column).length > 0;
    // `email` is a registered node with no executor yet.
    default:
      return false;
  }
}

/** A column's configured search inputs, or none when it has no usable config. */
function sourceColumnsOf(column: ColumnRecord): number[] {
  return toNodeConfig(column.config)?.sourceColumns ?? [];
}

/**
 * The cells a Google Search column is given, resolved against this row **in
 * the configured order** — the order is the client's, not the sheet's, so
 * "Company, Country" reads that way in the prompt.
 *
 * Three kinds of entry are dropped: the target column itself (searching for
 * the cell you are filling is circular), an index whose column has since been
 * removed, and a cell that is blank for this row. What survives is what the
 * model may see. Nothing surviving means this row has no subject to search
 * for, and the caller turns that into a failed run.
 */
function searchInputs(
  column: RunnableColumn,
  rowCells: RunAiInputCell[],
): RunAiInputCell[] {
  const byIndex = new Map(rowCells.map((cell) => [cell.index, cell]));
  const inputs = sourceColumnsOf(column)
    .filter((index) => index !== column.index)
    .map((index) => byIndex.get(index))
    .filter((cell): cell is RunAiInputCell => cell !== undefined)
    .filter((cell) => cell.value !== null && cell.value !== "");
  if (inputs.length === 0) throw new RunAiNoSearchInputError(column.index);
  return inputs;
}

/** The dispatcher payload: the targets regrouped by column, waves in sort order. */
function toWaves(targets: Target[], runs: RunAi[]): RunAiWave[] {
  const waves = new Map<number, RunAiWave>();
  targets.forEach((target, position) => {
    const run = runs[position];
    if (!run) return;
    const { index, name } = target.column;
    const wave = waves.get(index) ?? {
      columnIndex: index,
      columnName: name,
      cells: [],
    };
    wave.cells.push({ runId: run.id, rowIndex: target.rowIndex });
    waves.set(index, wave);
  });
  return [...waves.values()];
}

export class RunAiBatchService {
  private dispatcher: RunAiDispatcher | null = null;

  setDispatcher(dispatcher: RunAiDispatcher | null): void {
    this.dispatcher = dispatcher;
  }

  /**
   * Runs the AI cells of a rectangle. Every run is created `pending` at once
   * (the inserts already reach the sheet through the stream) under one
   * batch id, then the worker is handed the column waves. A dispatch that
   * throws fails every run of the batch and surfaces as `RunAiDispatchError`;
   * no dispatcher leaves them pending. The response is in series order.
   */
  async runCells(input: RunAiCellsInput): Promise<RunAi[]> {
    const targets = await this.plan(input);
    await this.assertCellsFree(
      input.id,
      targets.map((target) => target.cellId),
    );
    const batchId = `batch-${crypto.randomUUID()}`;
    const runs = await this.createRuns(input.id, batchId, targets);
    if (this.dispatcher === null) return runs;
    try {
      await this.dispatcher({
        batchId,
        spreadsheetId: input.id,
        waves: toWaves(targets, runs),
      });
    } catch (error) {
      const failure = describeError(error);
      await runAiService.failPending(
        runs.map((run) => run.id),
        { error: failure },
      );
      throw new RunAiDispatchError(batchId, failure.message);
    }
    return runs;
  }

  /**
   * Builds one cell's input from the database as it is *now* — the row with
   * every earlier column's answer persisted — plus, from the second step of
   * a row on, the previous run's output as `previous`, and stores it on the
   * still-`pending` run. The orchestrator calls this right before the cell's
   * wave. A run that already finished is reported, never re-prepared.
   *
   * How much of the row goes in is the node's rule (`runAiInputSchema`): an
   * `ai` cell gets the whole row, a `google_search` cell gets only the cells
   * its `config.sourceColumns` names.
   */
  async prepare(
    runId: string,
    previousRunId?: string,
  ): Promise<{ run: RunAi; input: RunAiInput }> {
    const run = await runAiService.byId(runId);
    if (isTerminalRunAiStatus(run.status)) throw new RunAiFinishedError(runId);
    const address = parseCellId(run.cellId);
    if (!address) throw new RunAiInvalidCellIdError(run.cellId);
    const column = await spreadsheetService.columnOrThrow(
      address.sheetId,
      address.col,
    );
    if (!isRunnable(column)) throw new RunAiColumnNotRunnableError(address.col);
    const node = toWireNodeType(column.node);
    const [{ columns, cells }, previous] = await Promise.all([
      spreadsheetService.rowCells(address.sheetId, address.row),
      previousRunId === undefined
        ? undefined
        : this.previousOutput(previousRunId),
    ]);
    const rowCells = buildRowCells(columns, cells);
    const search =
      node === "google_search"
        ? { sourceColumns: searchInputs(column, rowCells) }
        : undefined;
    const input: RunAiInput = {
      prompt: column.prompt,
      target: {
        id: shortColumnId(column.index),
        index: column.index,
        name: column.name,
        type: toWireColumnType(column.type),
        node,
      },
      row: {
        id: shortRowId(address.row),
        index: address.row,
        // A search node is deliberately given no row context at all.
        cells: search === undefined ? rowCells : [],
      },
      ...(search !== undefined && { search }),
      ...(previous !== undefined && { previous }),
    };
    const prepared = await runAiService.setResult(runId, { input });
    return { run: prepared, input };
  }

  /** The selected AI columns in sort order × the selected rows ascending. */
  private async plan({
    id,
    rowIndexes,
    columnIndexes,
  }: RunAiCellsInput): Promise<Target[]> {
    await spreadsheetService.byId(id);
    const wanted = new Set(columnIndexes);
    const columns = (await spreadsheetService.columnsOf(id)).filter(
      (column): column is RunnableColumn =>
        wanted.has(column.index) && isRunnable(column),
    );
    if (columns.length === 0) {
      throw new RunAiColumnNotRunnableError(columnIndexes);
    }
    const rows = [...new Set(rowIndexes)].sort((a, b) => a - b);
    const total = rows.length * columns.length;
    if (total > MAX_RUN_AI_BATCH_CELLS) {
      throw new RunAiBatchTooLargeError(total, MAX_RUN_AI_BATCH_CELLS);
    }
    return rows.flatMap((rowIndex) =>
      columns.map((column) => ({
        rowIndex,
        column,
        cellId: cellId(id, rowIndex, column.index),
      })),
    );
  }

  /** Names the selected cells that already have a working run, if any. */
  private async assertCellsFree(
    sheetId: string,
    cellIds: string[],
  ): Promise<void> {
    const wanted = new Set(cellIds);
    const busy = (await runAiService.listActiveBySpreadsheet(sheetId))
      .map((run) => run.cellId)
      .filter((id) => wanted.has(id));
    if (busy.length > 0) throw new RunAiCellBusyError(busy);
  }

  /** One insert for the whole batch, handed back in target order. */
  private async createRuns(
    sheetId: string,
    batchId: string,
    targets: Target[],
  ): Promise<RunAi[]> {
    let created: RunAi[];
    try {
      created = await runAiService.createMany(
        targets.map((target) => ({ cellId: target.cellId, batchId })),
      );
    } catch (error) {
      // Lost the race with another writer: name the cells, as the pre-check
      // would have; the index is the guarantee, the pre-check the message.
      if (error instanceof RunAiCellBusyError) {
        await this.assertCellsFree(
          sheetId,
          targets.map((target) => target.cellId),
        );
      }
      throw error;
    }
    const byCell = new Map(created.map((run) => [run.cellId, run]));
    return targets.map((target) => {
      const run = byCell.get(target.cellId);
      if (!run) throw new Error(`Run for ${target.cellId} was not created`);
      return run;
    });
  }

  /** The previous step's target column with the value it produced, or nothing. */
  private async previousOutput(
    runId: string,
  ): Promise<RunAiInputCell | undefined> {
    const previous = await runAiService.byId(runId);
    const target = previous.result?.input?.target;
    const output = previous.result?.output;
    if (target === undefined || output === undefined || output === null) {
      return undefined;
    }
    // Named rather than spread: a target carries the `node` that produced the
    // value, and `previous` is a *cell* — where the value came from is not
    // part of the shape, and spreading would smuggle it in.
    return {
      id: target.id,
      index: target.index,
      name: target.name,
      type: target.type,
      value: output,
    };
  }
}

export const runAiBatchService = new RunAiBatchService();
