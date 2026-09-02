import { EventEmitter, on } from "node:events";
import type { Prisma } from "../../../generated/prisma/client";
import {
  isRecordNotFound,
  isUniqueViolation,
} from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import { parseCellId } from "../spreadsheet/spreadsheet.ids";
import { spreadsheetCellsService } from "../spreadsheet/spreadsheet-cells.service";
import {
  RunAiCellBusyError,
  RunAiInvalidCellIdError,
  RunAiNotFoundError,
} from "./run-ai.errors";
import type { RunAiFeedNotice } from "./run-ai.feed";
import { runAiFeed } from "./run-ai.feed";
import type {
  CompleteRunAiInput,
  CreateRunAiInput,
  FailRunAiInput,
  RunAi,
  RunAiChange,
  RunAiChangesInput,
  RunAiEvent,
  RunAiResult,
  SetRunAiStatusInput,
  UpsertRunAiTestInput,
} from "./run-ai.schema";
import {
  isTerminalRunAiStatus,
  RUN_AI_TERMINAL_STATUSES_DB,
  toDbRunAiStatus,
  toWireRunAiStatus,
} from "./run-ai.schema";

// Framework-free: no @nestjs/* imports, no decorators — src/trpc/** imports
// the singleton below. Writes come from in-process callers (the spreadsheet
// service, a Trigger.dev task) and the REST test endpoint; the database
// enforces one working run per cell (partial unique index) and publishes
// every change (trigger), which `changes()` turns into a per-sheet stream.

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

type RunAiRecord = Prisma.RunAiGetPayload<{ select: typeof runAiSelect }>;

/** How many rows a reconnecting subscriber may replay. */
const REPLAY_LIMIT = 500;

// Zod cannot express Prisma.InputJsonValue exactly; the runtime shapes match.
const toJsonInput = (result: RunAiResult): Prisma.InputJsonValue =>
  result as Prisma.InputJsonValue;

function toRunAi(record: RunAiRecord): RunAi {
  return {
    ...record,
    status: toWireRunAiStatus(record.status),
    // complete/fail are the only writers and only accept objects.
    result: (record.result ?? null) as RunAiResult | null,
  };
}

/** The SSE event id: the row's `updatedAt` in ms, so replay is a range query. */
const eventId = (run: RunAi) => String(run.updatedAt.getTime());

/** "0" replays everything; anything unparsable replays nothing. */
function parseEventId(id: string | null | undefined): Date | null {
  if (id === null || id === undefined || id === "") return null;
  const ms = Number(id);
  return Number.isFinite(ms) && ms >= 0 ? new Date(ms) : null;
}

type LiveChange = { kind: "run"; run: RunAi } | { kind: "resync" };

export class RunAiService {
  /** Resolved changes, emitted as `"change"` with a `LiveChange`. */
  private readonly events = new EventEmitter();
  private pumping = false;

  constructor() {
    this.events.setMaxListeners(0);
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
          credit: input.credit ?? 0,
          ...(input.status !== undefined && {
            status: toDbRunAiStatus(input.status),
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

  markRunning(id: string): Promise<RunAi> {
    return this.setStatus(id, { status: "running" });
  }

  /**
   * Any transition, including custom working stages ("analyzing"). A
   * `completed` status routes through `complete` so the cell write happens.
   */
  setStatus(id: string, input: SetRunAiStatusInput): Promise<RunAi> {
    if (input.status === "completed") {
      return this.complete(id, {
        result: input.result ?? {},
        ...(input.credit !== undefined && { credit: input.credit }),
      });
    }
    return this.update(id, {
      status: toDbRunAiStatus(input.status),
      ...(input.result !== undefined && { result: toJsonInput(input.result) }),
      ...(input.credit !== undefined && { credit: input.credit }),
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
      const run = await this.getOrThrow(id);
      const address = parseCellId(run.cellId);
      if (!address) throw new RunAiInvalidCellIdError(run.cellId);
      await spreadsheetCellsService.setCell({
        id: address.sheetId,
        rowIndex: address.row,
        columnIndex: address.col,
        value: output,
      });
    }
    return this.update(id, {
      status: "COMPLETED",
      result: toJsonInput(input.result),
      ...(input.credit !== undefined && { credit: input.credit }),
    });
  }

  fail(id: string, input: FailRunAiInput = {}): Promise<RunAi> {
    return this.update(id, {
      status: "FAILED",
      ...(input.result !== undefined && { result: toJsonInput(input.result) }),
    });
  }

  async byId(id: string): Promise<RunAi> {
    return toRunAi(await this.getOrThrow(id));
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

  /**
   * `POST /run-ai/test`. With an `id`, transitions that run. With a `cellId`,
   * addresses the cell's working run if it has one — a `status` transitions
   * it, no `status` is a duplicate and refused — and otherwise creates one,
   * transitioning straight on when the status asked for is terminal.
   */
  async upsertForTest(
    input: UpsertRunAiTestInput,
  ): Promise<{ run: RunAi; created: boolean }> {
    const transition = (id: string, status: string) =>
      this.setStatus(id, {
        status,
        ...(input.result !== undefined && { result: input.result }),
        ...(input.credit !== undefined && { credit: input.credit }),
      });

    if (input.id !== undefined) {
      // The schema requires `status` alongside `id`.
      const run = await transition(input.id, input.status ?? "running");
      return { run, created: false };
    }

    // The schema requires `cellId` without `id`.
    const cellId = input.cellId ?? "";
    const active = await this.activeForCell(cellId);
    if (active) {
      if (input.status === undefined) throw new RunAiCellBusyError(cellId);
      return { run: await transition(active.id, input.status), created: false };
    }

    const terminal =
      input.status !== undefined && isTerminalRunAiStatus(input.status);
    const created = await this.create({
      cellId,
      batchId: input.batchId ?? `test-${crypto.randomUUID()}`,
      ...(input.credit !== undefined && { credit: input.credit }),
      ...(input.status !== undefined && !terminal && { status: input.status }),
    });
    if (!terminal || input.status === undefined) {
      return { run: created, created: true };
    }
    return { run: await transition(created.id, input.status), created: true };
  }

  /** The cell's working run, if any — at most one exists (partial unique index). */
  private async activeForCell(cellId: string): Promise<RunAi | null> {
    const record = await prisma.runAi.findFirst({
      where: { cellId, status: { notIn: [...RUN_AI_TERMINAL_STATUSES_DB] } },
      select: runAiSelect,
    });
    return record ? toRunAi(record) : null;
  }

  /**
   * The `runAi.onChange` stream for one sheet: a replay of everything since
   * `lastEventId` (when reconnecting), then a snapshot of the working runs,
   * then every change as it happens — until a terminal change leaves the
   * sheet with nothing working, when `closed` is the last event and the
   * stream ends (a generation, not a socket; the sheet reopens it the next
   * time a run starts). Subscribes to the live feed *before* reading, so
   * nothing can slip between the snapshot and the first live event. Also
   * ends when `signal` aborts (client gone).
   */
  async *changes(
    input: RunAiChangesInput,
    signal?: AbortSignal,
  ): AsyncGenerator<RunAiEvent, void, undefined> {
    await runAiFeed.ensureStarted();
    this.ensurePump();
    const live = on(this.events, "change", { signal }) as AsyncIterableIterator<
      [LiveChange]
    >;
    try {
      const since = parseEventId(input.lastEventId);
      if (since) {
        const replay = await this.listChangedSince(input.spreadsheetId, since);
        for (const run of replay) {
          yield { id: eventId(run), change: { type: "run", run } };
        }
      }
      yield await this.snapshot(input.spreadsheetId);
      for await (const [change] of live) {
        if (change.kind === "resync") {
          yield await this.snapshot(input.spreadsheetId);
          continue;
        }
        if (change.run.spreadsheetId !== input.spreadsheetId) continue;
        const run = change.run;
        yield { id: eventId(run), change: { type: "run", run } };
        if (!isTerminalRunAiStatus(run.status)) continue;
        const working = await this.listActiveBySpreadsheet(input.spreadsheetId);
        if (working.length === 0) {
          yield { id: eventId(run), change: { type: "closed" } };
          return;
        }
      }
    } catch (error) {
      // `on()` rejects with AbortError when the signal fires; that is the
      // normal end of a subscription, not a failure.
      if (signal?.aborted) return;
      throw error;
    } finally {
      await live.return?.();
    }
  }

  /**
   * Tracked by the newest `updatedAt` of the sheet, so a reconnect replays
   * from a database timestamp rather than this process's clock. "0" (no
   * runs yet) replays everything created since — which is exactly what a
   * subscriber that saw an empty sheet needs.
   */
  private async snapshot(spreadsheetId: string): Promise<RunAiEvent> {
    const [runs, latest] = await Promise.all([
      this.listActiveBySpreadsheet(spreadsheetId),
      prisma.runAi.findFirst({
        where: { spreadsheetId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);
    const change: RunAiChange = { type: "snapshot", runs };
    return { id: String(latest?.updatedAt.getTime() ?? 0), change };
  }

  /**
   * One listener per process resolves feed notices (row ids) into rows and
   * re-emits them, so N subscribers cost one read per change, not N. Each
   * read returns the row as it is *now*, so out-of-order resolution can only
   * ever repeat the latest state, never regress it.
   */
  private ensurePump() {
    if (this.pumping) return;
    this.pumping = true;
    runAiFeed.events.on("notice", (notice: RunAiFeedNotice) => {
      if (notice.kind === "resync") {
        this.events.emit("change", { kind: "resync" } satisfies LiveChange);
        return;
      }
      this.find(notice.id)
        .then((run) => {
          if (run) this.events.emit("change", { kind: "run", run });
        })
        .catch((error: unknown) => {
          console.error(
            "[run-ai] could not read changed run:",
            error instanceof Error ? error.message : error,
          );
        });
    });
  }

  /** A row deleted between notify and read is simply not an event. */
  private async find(id: string): Promise<RunAi | null> {
    const record = await prisma.runAi.findUnique({
      where: { id },
      select: runAiSelect,
    });
    return record ? toRunAi(record) : null;
  }

  private async getOrThrow(id: string): Promise<RunAiRecord> {
    const record = await prisma.runAi.findUnique({
      where: { id },
      select: runAiSelect,
    });
    if (!record) throw new RunAiNotFoundError(id);
    return record;
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
