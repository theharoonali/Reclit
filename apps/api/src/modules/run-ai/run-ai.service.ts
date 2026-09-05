import type { Prisma } from "../../../generated/prisma/client";
import { describeError } from "../../common/errors";
import {
  isRecordNotFound,
  isUniqueViolation,
} from "../../common/prisma-errors";
import { prisma, toJsonInput } from "../../db/prisma";
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
import { buildRowCells } from "../spreadsheet/spreadsheet.shape";
import { spreadsheetCellsService } from "../spreadsheet/spreadsheet-cells.service";
import {
  RunAiCellBusyError,
  RunAiColumnNotRunnableError,
  RunAiDispatchError,
  RunAiFinishedError,
  RunAiInvalidCellIdError,
  RunAiNotFoundError,
} from "./run-ai.errors";
import type {
  CompleteRunAiInput,
  CreateRunAiInput,
  FailRunAiInput,
  RunAi,
  RunAiCellInput,
  RunAiInput,
  RunAiJobPayload,
  RunAiResult,
  SetRunAiStatusInput,
} from "./run-ai.schema";
import {
  RUN_AI_TERMINAL_STATUSES_DB,
  toDbRunAiStatus,
  toWireRunAiStatus,
} from "./run-ai.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The run lifecycle:
// `runCell` creates runs and hands them to the worker through the dispatcher
// hook; the Trigger.dev task transitions them. The database enforces one
// working run per cell (partial unique index). The live stream is
// run-ai-changes.service.ts.

/**
 * Asks the worker to execute a run. Registered by src/jobs/run-ai-dispatch.ts
 * (the only importer of @trigger.dev/sdk) from src/main.ts — this graph is
 * transpiled by the dashboard and may not import the SDK itself. Without one
 * (tests) a run stays `pending`.
 */
export type RunAiDispatcher = (payload: RunAiJobPayload) => Promise<void>;

const runAiSelect = {
  id: true,
  cellId: true,
  spreadsheetId: true,
  batchId: true,
  status: true,
  credit: true,
  result: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** How many rows a reconnecting subscriber may replay. */
const REPLAY_LIMIT = 500;

function toRunAi(
  record: Prisma.RunAiGetPayload<{ select: typeof runAiSelect }>,
): RunAi {
  return {
    ...record,
    status: toWireRunAiStatus(record.status),
    // complete/fail are the only writers and only accept objects.
    result: (record.result ?? null) as RunAiResult | null,
  };
}

/** The optional fields a create or transition may carry. */
function resultAndCredit({
  result,
  credit,
}: {
  result?: RunAiResult;
  credit?: number;
}): { result?: Prisma.InputJsonValue; credit?: number } {
  return {
    ...(result !== undefined && { result: toJsonInput(result) }),
    ...(credit !== undefined && { credit }),
  };
}

export class RunAiService {
  private dispatcher: RunAiDispatcher | null = null;

  setDispatcher(dispatcher: RunAiDispatcher | null): void {
    this.dispatcher = dispatcher;
  }

  /**
   * Runs one AI cell. The column must be an AI node with a prompt; the
   * input is the whole row in column sort order plus that prompt. The run
   * is created `pending` with `result.input` — the insert already reaches
   * the sheet through the stream — and then handed to the worker. A
   * dispatch that throws fails the run (the reason lands in `result.error`)
   * and surfaces as `RunAiDispatchError`; no dispatcher leaves it pending.
   */
  async runCell(address: RunAiCellInput): Promise<RunAi> {
    const column = await spreadsheetService.columnOrThrow(
      address.id,
      address.columnIndex,
    );
    if (
      column.node === null ||
      toWireNodeType(column.node) !== "ai" ||
      column.prompt === null
    ) {
      throw new RunAiColumnNotRunnableError(address.columnIndex);
    }
    const { columns, cells } = await spreadsheetService.rowCells(
      address.id,
      address.rowIndex,
    );
    const input: RunAiInput = {
      prompt: column.prompt,
      target: {
        id: shortColumnId(column.index),
        index: column.index,
        name: column.name,
        type: toWireColumnType(column.type),
      },
      row: {
        id: shortRowId(address.rowIndex),
        index: address.rowIndex,
        cells: buildRowCells(columns, cells),
      },
    };
    const run = await this.create({
      cellId: cellId(address.id, address.rowIndex, address.columnIndex),
      batchId: `run-${crypto.randomUUID()}`,
      result: { input },
    });
    if (this.dispatcher === null) return run;
    try {
      await this.dispatcher({ runId: run.id, input });
    } catch (error) {
      const failure = describeError(error);
      await this.fail(run.id, { result: { input, error: failure } });
      throw new RunAiDispatchError(run.id, failure.message);
    }
    return run;
  }

  async create(input: CreateRunAiInput): Promise<RunAi> {
    const address = parseCellId(input.cellId);
    if (!address) throw new RunAiInvalidCellIdError(input.cellId);
    try {
      const record = await prisma.runAi.create({
        data: {
          cellId: input.cellId,
          spreadsheetId: address.sheetId,
          batchId: input.batchId,
          ...(input.status !== undefined && {
            status: toDbRunAiStatus(input.status),
          }),
          ...resultAndCredit({
            result: input.result,
            credit: input.credit ?? 0,
          }),
        },
        select: runAiSelect,
      });
      return toRunAi(record);
    } catch (error) {
      if (isUniqueViolation(error)) throw new RunAiCellBusyError(input.cellId);
      throw error;
    }
  }

  /**
   * The worker's first transition. Guarded: a run that already finished —
   * failed by the API after a dispatch timeout, say — is never revived, so
   * the only rows this touches are working ones.
   */
  async markRunning(id: string): Promise<RunAi> {
    const { count } = await prisma.runAi.updateMany({
      where: { id, status: { notIn: [...RUN_AI_TERMINAL_STATUSES_DB] } },
      data: { status: "RUNNING" },
    });
    if (count === 0) {
      await this.byId(id); // NOT_FOUND if the run never existed
      throw new RunAiFinishedError(id);
    }
    return this.byId(id);
  }

  /**
   * Any transition, including custom working stages ("analyzing"). A
   * `completed` status routes through `complete` so the cell write happens.
   */
  setStatus(id: string, input: SetRunAiStatusInput): Promise<RunAi> {
    if (input.status === "completed") {
      return this.complete(id, {
        result: input.result ?? {},
        credit: input.credit,
      });
    }
    return this.update(id, {
      status: toDbRunAiStatus(input.status),
      ...resultAndCredit(input),
    });
  }

  /**
   * Writes `result.output` into the cell first, then flips the run: the
   * order makes a failure between the two retry-safe, and guarantees the
   * `completed` event the dashboard receives describes a persisted cell. A
   * cell write the spreadsheet refuses (sheet or column gone, value of the
   * wrong type) propagates and leaves the run as it was.
   */
  async complete(id: string, input: CompleteRunAiInput): Promise<RunAi> {
    const output = input.result.output;
    if (output !== undefined && output !== null) {
      const run = await this.byId(id);
      const address = parseCellId(run.cellId);
      if (!address) throw new RunAiInvalidCellIdError(run.cellId);
      await spreadsheetCellsService.setCell({
        id: address.sheetId,
        rowIndex: address.row,
        columnIndex: address.col,
        value: output,
      });
    }
    return this.update(id, { status: "COMPLETED", ...resultAndCredit(input) });
  }

  fail(id: string, input: FailRunAiInput = {}): Promise<RunAi> {
    return this.update(id, { status: "FAILED", ...resultAndCredit(input) });
  }

  /** A run, or null. The stream uses this: a row deleted between a notify and its read is not an event. */
  async find(id: string): Promise<RunAi | null> {
    const record = await prisma.runAi.findUnique({
      where: { id },
      select: runAiSelect,
    });
    return record ? toRunAi(record) : null;
  }

  async byId(id: string): Promise<RunAi> {
    const run = await this.find(id);
    if (!run) throw new RunAiNotFoundError(id);
    return run;
  }

  async listByBatch(batchId: string): Promise<RunAi[]> {
    const records = await prisma.runAi.findMany({
      where: { batchId },
      select: runAiSelect,
      orderBy: { createdAt: "asc" },
    });
    return records.map(toRunAi);
  }

  /** The newest working run per cell of a sheet — what a fresh subscriber paints. */
  async listActiveBySpreadsheet(spreadsheetId: string): Promise<RunAi[]> {
    const records = await prisma.runAi.findMany({
      where: {
        spreadsheetId,
        status: { notIn: [...RUN_AI_TERMINAL_STATUSES_DB] },
      },
      distinct: ["cellId"],
      orderBy: [{ cellId: "asc" }, { createdAt: "desc" }],
      select: runAiSelect,
    });
    return records.map(toRunAi);
  }

  /** Rows touched at or after `since`, oldest first — the reconnect replay. */
  async listChangedSince(spreadsheetId: string, since: Date): Promise<RunAi[]> {
    const records = await prisma.runAi.findMany({
      where: { spreadsheetId, updatedAt: { gte: since } },
      orderBy: { updatedAt: "asc" },
      take: REPLAY_LIMIT,
      select: runAiSelect,
    });
    return records.map(toRunAi);
  }

  /** The sheet's newest `updatedAt` in ms — the snapshot's event id; "0" with no runs. */
  async latestEventId(spreadsheetId: string): Promise<string> {
    const latest = await prisma.runAi.findFirst({
      where: { spreadsheetId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });
    return String(latest?.updatedAt.getTime() ?? 0);
  }

  /** One statement, no read-then-write: a miss surfaces as P2025. */
  private async update(
    id: string,
    data: Prisma.RunAiUpdateInput,
  ): Promise<RunAi> {
    try {
      const record = await prisma.runAi.update({
        where: { id },
        data,
        select: runAiSelect,
      });
      return toRunAi(record);
    } catch (error) {
      if (isRecordNotFound(error)) throw new RunAiNotFoundError(id);
      // Reviving a finished run while another run works the same cell.
      if (isUniqueViolation(error)) throw new RunAiCellBusyError(id);
      throw error;
    }
  }
}

export const runAiService = new RunAiService();
