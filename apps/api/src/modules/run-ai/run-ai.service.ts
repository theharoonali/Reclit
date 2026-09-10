import type { Prisma } from "../../../generated/prisma/client";
import {
  isRecordNotFound,
  isUniqueViolation,
} from "../../common/prisma-errors";
import { prisma, toJsonInput } from "../../db/prisma";
import { parseCellId } from "../spreadsheet/spreadsheet.ids";
import { spreadsheetCellsService } from "../spreadsheet/spreadsheet-cells.service";
import {
  RunAiCellBusyError,
  RunAiFinishedError,
  RunAiInvalidCellIdError,
  RunAiNotFoundError,
} from "./run-ai.errors";
import type {
  CompleteRunAiInput,
  CreateRunAiInput,
  FailRunAiInput,
  RunAi,
  RunAiResult,
  RunAiResultInput,
  SetRunAiStatusInput,
} from "./run-ai.schema";
import {
  RUN_AI_TERMINAL_STATUSES_DB,
  toDbRunAiStatus,
  toWireRunAiStatus,
} from "./run-ai.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The run lifecycle and
// the reads: runs are created here (one or a whole batch), the Trigger.dev
// tasks transition them, and the database enforces one working run per cell
// (partial unique index). Which cells run, in what order, and the dispatcher
// hook live in run-ai-batch.service.ts; the live stream in
// run-ai-changes.service.ts.

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

/** The `where` half of "still working": any status but the terminal two. */
const WORKING: Prisma.StringFilter<"RunAi"> = {
  notIn: [...RUN_AI_TERMINAL_STATUSES_DB],
};

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

/**
 * The optional fields a create or transition may carry. `result` is the
 * *input* shape: `create` takes `z.input` (its `credit` defaults), so a caller
 * may hand over a result whose defaulted fields — `input.target.node` — are
 * still absent. Either way it is written verbatim as JSON.
 */
function resultAndCredit({
  result,
  credit,
}: {
  result?: RunAiResultInput;
  credit?: number;
}): { result?: Prisma.InputJsonValue; credit?: number } {
  return {
    ...(result !== undefined && { result: toJsonInput(result) }),
    ...(credit !== undefined && { credit }),
  };
}

/** One create input as a row; shared by `create` and `createMany`. */
function toCreateData(input: CreateRunAiInput): Prisma.RunAiCreateManyInput {
  const address = parseCellId(input.cellId);
  if (!address) throw new RunAiInvalidCellIdError(input.cellId);
  return {
    cellId: input.cellId,
    spreadsheetId: address.sheetId,
    batchId: input.batchId,
    ...(input.status !== undefined && {
      status: toDbRunAiStatus(input.status),
    }),
    ...resultAndCredit({ result: input.result, credit: input.credit ?? 0 }),
  };
}

export class RunAiService {
  async create(input: CreateRunAiInput): Promise<RunAi> {
    const data = toCreateData(input);
    try {
      const record = await prisma.runAi.create({ data, select: runAiSelect });
      return toRunAi(record);
    } catch (error) {
      if (isUniqueViolation(error)) throw new RunAiCellBusyError(input.cellId);
      throw error;
    }
  }

  /**
   * Every run of one batch in a single statement — all or nothing, so a busy
   * cell anywhere in the batch creates no run at all. The rows come back in
   * the statement's order, which is not a promise: callers match them to
   * their plan by `cellId`.
   */
  async createMany(inputs: CreateRunAiInput[]): Promise<RunAi[]> {
    const data = inputs.map(toCreateData);
    try {
      const records = await prisma.runAi.createManyAndReturn({
        data,
        select: runAiSelect,
      });
      return records.map(toRunAi);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RunAiCellBusyError(inputs.map((input) => input.cellId));
      }
      throw error;
    }
  }

  /**
   * The worker's first transition. Guarded: a run that already finished —
   * failed by the API after a dispatch timeout, say — is never revived, so
   * the only rows this touches are working ones.
   */
  markRunning(id: string): Promise<RunAi> {
    return this.updateWorking(id, { status: "RUNNING" });
  }

  /**
   * Stores `result` on a working run without touching its status — how the
   * batch orchestrator records a prepared step's `input` while the run is
   * still `pending`. Same guard as `markRunning`.
   */
  setResult(id: string, result: RunAiResult): Promise<RunAi> {
    return this.updateWorking(id, { result: toJsonInput(result) });
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

  /**
   * Fails every given run that is still working, in one statement, and says
   * how many it flipped. A terminal row is never touched, so a batch crash or
   * a late `onFailure` cannot revive or overwrite a completed step.
   */
  async failPending(ids: string[], result: RunAiResult): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await prisma.runAi.updateMany({
      where: { id: { in: ids }, status: WORKING },
      data: { status: "FAILED", result: toJsonInput(result) },
    });
    return count;
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
      where: { spreadsheetId, status: WORKING },
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

  /** A guarded write: only a working run changes; a finished one is reported, never revived. */
  private async updateWorking(
    id: string,
    data: Prisma.RunAiUpdateManyMutationInput,
  ): Promise<RunAi> {
    const { count } = await prisma.runAi.updateMany({
      where: { id, status: WORKING },
      data,
    });
    if (count === 0) {
      await this.byId(id); // NOT_FOUND if the run never existed
      throw new RunAiFinishedError(id);
    }
    return this.byId(id);
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
