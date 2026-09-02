/**
 * CONTRACT — run-ai
 * Feature doc: docs/features/run-ai.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `RunAi`
 *   id             String    pk, uuid
 *   cellId         String    scoped Cell pk "<sheetId>.cell.<r>.<c>"; plain string (no fk), indexed
 *   spreadsheetId  String    the sheet half of cellId, derived on create; indexed with updatedAt
 *   batchId        String    required, indexed
 *   status         String    uppercase; PENDING | RUNNING | COMPLETED | FAILED or a custom stage
 *                            (ANALYZING, …); default PENDING. COMPLETED / FAILED are terminal.
 *   credit         Int       default 0
 *   result         Json?     object or null; `result.output` is the cell value the run produced
 *   createdAt      DateTime  now(), indexed
 *   updatedAt      DateTime  @updatedAt
 *   Partial unique index `RunAi_active_cell_key` (cellId WHERE status NOT IN
 *   terminal): one working run per cell. Trigger `run_ai_notify` publishes
 *   every insert/update id on channel `run_ai_changed`.
 *
 * MODEL  RunAi = {
 *   id: string; cellId: string; spreadsheetId: string; batchId: string;
 *   status: string;                       // lowercase: "pending" | "running" | "completed" | "failed" | "<custom>"
 *   credit: number;
 *   result: ({ output?: CellValue } & Record<string, unknown>) | null;
 *   createdAt: Date; updatedAt: Date;
 * }
 * RunAiChange =
 *   | { type: "snapshot"; runs: RunAi[] }   // every working run of the sheet, newest per cell
 *   | { type: "run"; run: RunAi }           // one run after an insert or update
 *   | { type: "closed" }                    // the last working run finished; last event, the stream ends
 * Dates cross the wire as real Date objects (superjson). Status is lowercase
 * on the wire and uppercase in the database.
 *
 * PROCEDURES
 * | Procedure         | Kind         | Payload                                   | Response                       | Errors                 |
 * | ----------------- | ------------ | ----------------------------------------- | ------------------------------ | ---------------------- |
 * | runAi.byId        | query        | { id: string }                            | RunAi                          | NOT_FOUND, BAD_REQUEST |
 * | runAi.listByBatch | query        | { batchId: string }                       | RunAi[]                        | BAD_REQUEST            |
 * | runAi.listActive  | query        | { spreadsheetId: string }                 | RunAi[] (working runs)         | BAD_REQUEST            |
 * | runAi.onChange    | subscription | { spreadsheetId: string; lastEventId? }   | SSE of tracked RunAiChange     | BAD_REQUEST            |
 *
 * REST (`apps/api/src/modules/run-ai/run-ai.controller.ts`)
 * | Route              | Body                                                          | Response                | Status                                      |
 * | ------------------ | ------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
 * | POST /run-ai/test  | { cellId; batchId?; status?; result?; credit? }  (no `id`)  | RunAi (created, 201 — or the cell's working run transitioned, 200) | 400 validation / invalid cellId; 404 sheet / column; 409 busy |
 * | POST /run-ai/test  | { id; status; result?; credit? }                 (with `id`) | RunAi (transitioned)    | 200; 400; 404 run / sheet / column; 409 busy |
 *
 * NOTES
 * - The stream is a generation, not a socket. A sheet should be streaming
 *   exactly while it has a run that is not `completed` / `failed`:
 *   `listActive` answers that on page load (non-empty → subscribe), the
 *   sheet's Run button subscribes ahead of the first run, and when a
 *   terminal `run` event leaves the sheet with no working run the server
 *   sends `{ type: "closed" }` as the last event and ends the stream. A
 *   client must stop subscribing on `closed` (tRPC would otherwise reconnect
 *   and get a fresh, open stream).
 * - `onChange` streams one sheet: with `lastEventId` it first replays every
 *   run whose `updatedAt >= lastEventId` (oldest first, at most 500), then
 *   sends a `snapshot`, then a `run` event per change as it happens. Every
 *   event is `tracked`: a `run` event's id is `String(run.updatedAt.getTime())`,
 *   a `snapshot`'s id is the sheet's newest `updatedAt` ("0" when it has no
 *   runs). tRPC re-sends the last id on reconnect, so replay uses `>=` and a
 *   client must apply events idempotently. Pings every 15 s; a client that
 *   hears nothing for 45 s reconnects. The stream ends when the client goes.
 * - Status: any single word (`/^[A-Za-z][A-Za-z0-9_-]*$/`, ≤ 50 chars),
 *   case-insensitive on input and lowercase on the wire. `completed` and
 *   `failed` are the only terminal values; a new run may not start in one.
 * - One working run per cell: creating a second, or reviving a finished run
 *   while another works the cell, is `RUN_AI_CELL_BUSY` (409 / CONFLICT).
 * - `complete` with a non-null `result.output` writes that value into the
 *   Cell row *before* flipping the run — the spreadsheet's own rules apply
 *   (sheet and column must exist, value must fit the column type), and a
 *   refused write leaves the run untouched. Without `output` only the run
 *   changes. `fail` never touches the cell.
 * - `POST /run-ai/test` is the manual driver. `id` + `status` transitions
 *   that run. `cellId` addresses the cell: if it has a working run, a
 *   `status` transitions it (200) and no `status` is a duplicate (409);
 *   otherwise a run is created (201, `batchId` defaults to `test-<uuid>`),
 *   and a terminal `status` transitions it straight on so one POST can
 *   create + complete. Everything goes through the same service methods
 *   (`completed` routes through `complete`). Errors follow
 *   the shared DomainErrorFilter: 400 `VALIDATION_FAILED` / `RUN_AI_INVALID_CELL_ID`
 *   / `SPREADSHEET_CELL_TYPE_MISMATCH`, 404 `RUN_AI_NOT_FOUND` /
 *   `SPREADSHEET_COLUMN_NOT_FOUND`, 409 `RUN_AI_CELL_BUSY`.
 * - `listByBatch` is createdAt ascending; an unknown batchId returns `[]`.
 * - `cellId` must parse as "<sheetId>.cell.<r>.<c>" (`RUN_AI_INVALID_CELL_ID`
 *   otherwise) but is never validated against Cell — the cell may be gone.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createApp } from "../bootstrap";
import { pingDatabase, prisma } from "../db/prisma";
import {
  RunAiCellBusyError,
  RunAiInvalidCellIdError,
  RunAiNotFoundError,
} from "../modules/run-ai/run-ai.errors";
import { runAiFeed } from "../modules/run-ai/run-ai.feed";
import type {
  CreateRunAiInput,
  RunAiChange,
} from "../modules/run-ai/run-ai.schema";
import { runAiService } from "../modules/run-ai/run-ai.service";
import {
  SpreadsheetCellTypeMismatchError,
  SpreadsheetColumnNotFoundError,
} from "../modules/spreadsheet/spreadsheet.errors";
import { makeWorkspace, removeWorkspace } from "./support/fixtures";
import {
  caller,
  callerWithSignal,
  expectDate,
  expectTRPCError,
  nextTracked,
} from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

const createdIds: string[] = [];

// A real sheet for the cell-writing paths; every other test names cells on a
// sheet that does not exist, which the run table allows.
let workspaceId = "";
let sheetId = "";
let textColumn = 0;
let boolColumn = 0;

// The partial unique index allows one working run per cell, so every staged
// run gets a cell of its own.
let cellCounter = 0;
const nextCellId = (sheet = "contract-sheet") =>
  `${sheet}.cell.${cellCounter++}.0`;

/** Stages a run through the service — the only in-process writer. */
async function makeRun(over: Partial<CreateRunAiInput> = {}) {
  const run = await runAiService.create({
    cellId: nextCellId(),
    batchId: `contract-batch-${crypto.randomUUID()}`,
    ...over,
  });
  createdIds.push(run.id);
  return run;
}

async function expectError<T>(
  promise: Promise<unknown>,
  type: new (...args: never[]) => T,
): Promise<T> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(type);
  return caught as T;
}

beforeAll(async () => {
  if (!dbUp) return;
  const workspace = await makeWorkspace("run-ai contract");
  workspaceId = workspace.id;
  sheetId = workspace.spreadsheetId ?? "";
  const text = await caller.spreadsheet.createColumn({
    id: sheetId,
    name: "Answer",
  });
  textColumn = text.index;
  const bool = await caller.spreadsheet.createColumn({
    id: sheetId,
    name: "Flag",
    type: "boolean",
  });
  boolColumn = bool.index;
});

afterAll(async () => {
  await runAiFeed.stop();
  if (createdIds.length > 0) {
    await prisma.runAi
      .deleteMany({ where: { id: { in: createdIds } } })
      .catch(() => {});
  }
  if (workspaceId) await removeWorkspace(workspaceId);
});

describe.skipIf(!dbUp)("runAi.byId", () => {
  it("reads back a run created with the minimal payload and its defaults", async () => {
    const created = await makeRun({ cellId: "contract-sheet.cell.0.0" });
    const run = await caller.runAi.byId({ id: created.id });
    expect(run).toMatchObject({
      id: created.id,
      cellId: "contract-sheet.cell.0.0",
      spreadsheetId: "contract-sheet",
      batchId: created.batchId,
      status: "pending",
      credit: 0,
      result: null,
    });
    expectDate(run.createdAt);
    expectDate(run.updatedAt);
  });

  it("reads back a run created with the full payload", async () => {
    const created = await makeRun({
      cellId: "contract-sheet.cell.3.2",
      credit: 3,
      status: "Analyzing",
    });
    const run = await caller.runAi.byId({ id: created.id });
    expect(run).toMatchObject({
      cellId: "contract-sheet.cell.3.2",
      spreadsheetId: "contract-sheet",
      credit: 3,
      status: "analyzing",
    });
  });

  it("reflects markRunning", async () => {
    const created = await makeRun();
    await runAiService.markRunning(created.id);
    const run = await caller.runAi.byId({ id: created.id });
    expect(run.status).toBe("running");
    expect(run.result).toBeNull();
  });

  it("reflects a custom stage set through setStatus, lowercase on the wire", async () => {
    const created = await makeRun();
    await runAiService.setStatus(created.id, {
      status: "web_search",
      result: { query: "reclit" },
    });
    const run = await caller.runAi.byId({ id: created.id });
    expect(run.status).toBe("web_search");
    expect(run.result).toEqual({ query: "reclit" });
    const stored = await prisma.runAi.findUnique({
      where: { id: created.id },
      select: { status: true },
    });
    expect(stored?.status).toBe("WEB_SEARCH");
  });

  it("reflects complete with a result and a credit", async () => {
    const created = await makeRun();
    await runAiService.complete(created.id, {
      result: { text: "hello", usage: { totalTokens: 12 } },
      credit: 2,
    });
    const run = await caller.runAi.byId({ id: created.id });
    expect(run.status).toBe("completed");
    expect(run.result).toEqual({ text: "hello", usage: { totalTokens: 12 } });
    expect(run.credit).toBe(2);
  });

  it("complete without a credit leaves the credit intact", async () => {
    const created = await makeRun({ credit: 5 });
    await runAiService.complete(created.id, { result: { text: "kept" } });
    const run = await caller.runAi.byId({ id: created.id });
    expect(run.status).toBe("completed");
    expect(run.credit).toBe(5);
  });

  it("reflects fail with a result", async () => {
    const created = await makeRun();
    await runAiService.fail(created.id, { result: { error: "quota" } });
    const run = await caller.runAi.byId({ id: created.id });
    expect(run.status).toBe("failed");
    expect(run.result).toEqual({ error: "quota" });
  });

  it("fail without a result leaves the result null", async () => {
    const created = await makeRun();
    await runAiService.fail(created.id);
    const run = await caller.runAi.byId({ id: created.id });
    expect(run.status).toBe("failed");
    expect(run.result).toBeNull();
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.runAi.byId({ id: crypto.randomUUID() }),
      "NOT_FOUND",
    );
  });

  it("rejects an empty id (BAD_REQUEST)", async () => {
    await expectTRPCError(caller.runAi.byId({ id: "" }), "BAD_REQUEST");
  });

  it("a transition on a missing id throws RunAiNotFoundError (service)", async () => {
    await expectError(
      runAiService.markRunning(crypto.randomUUID()),
      RunAiNotFoundError,
    );
  });
});

describe.skipIf(!dbUp)("one working run per cell (service)", () => {
  it("refuses a second working run for the same cell with RunAiCellBusyError", async () => {
    const cellId = nextCellId();
    await makeRun({ cellId });
    const error = await expectError(
      makeRun({ cellId, status: "running" }),
      RunAiCellBusyError,
    );
    expect(error.code).toBe("RUN_AI_CELL_BUSY");
  });

  it("allows a new run once the previous one is terminal", async () => {
    const cellId = nextCellId();
    const first = await makeRun({ cellId });
    await runAiService.fail(first.id);
    const second = await makeRun({ cellId });
    expect(second.cellId).toBe(cellId);
    expect(second.status).toBe("pending");
  });

  it("refuses reviving a finished run while another works the cell", async () => {
    const cellId = nextCellId();
    const first = await makeRun({ cellId });
    await runAiService.complete(first.id, { result: {} });
    await makeRun({ cellId });
    await expectError(runAiService.markRunning(first.id), RunAiCellBusyError);
  });

  it("rejects a cellId that is not <sheetId>.cell.<r>.<c>", async () => {
    const error = await expectError(
      runAiService.create({ cellId: "nonsense", batchId: "b" }),
      RunAiInvalidCellIdError,
    );
    expect(error.code).toBe("RUN_AI_INVALID_CELL_ID");
  });
});

describe.skipIf(!dbUp)(
  "complete writes result.output into the cell (service)",
  () => {
    it("writes the output into the Cell row, then completes the run", async () => {
      const created = await makeRun({
        cellId: `${sheetId}.cell.0.${textColumn}`,
      });
      const run = await runAiService.complete(created.id, {
        result: { output: "Hello from AI", usage: { totalTokens: 3 } },
      });
      expect(run.status).toBe("completed");
      expect(run.result).toEqual({
        output: "Hello from AI",
        usage: { totalTokens: 3 },
      });
      const cell = await caller.spreadsheet.cell({
        id: sheetId,
        rowIndex: 0,
        columnIndex: textColumn,
      });
      expect(cell.value).toBe("Hello from AI");
    });

    it("leaves the cell alone when the result carries no output", async () => {
      await caller.spreadsheet.setCell({
        id: sheetId,
        rowIndex: 1,
        columnIndex: textColumn,
        value: "typed by hand",
      });
      const created = await makeRun({
        cellId: `${sheetId}.cell.1.${textColumn}`,
      });
      await runAiService.complete(created.id, {
        result: { text: "no output" },
      });
      const cell = await caller.spreadsheet.cell({
        id: sheetId,
        rowIndex: 1,
        columnIndex: textColumn,
      });
      expect(cell.value).toBe("typed by hand");
    });

    it("a value the column refuses leaves the run as it was", async () => {
      const created = await makeRun({
        cellId: `${sheetId}.cell.2.${boolColumn}`,
      });
      await expectError(
        runAiService.complete(created.id, { result: { output: "not a bool" } }),
        SpreadsheetCellTypeMismatchError,
      );
      const run = await caller.runAi.byId({ id: created.id });
      expect(run.status).toBe("pending");
      expect(run.result).toBeNull();
    });

    it("a cell whose column no longer exists leaves the run as it was", async () => {
      const created = await makeRun({ cellId: `${sheetId}.cell.3.999` });
      await expectError(
        runAiService.complete(created.id, { result: { output: "lost" } }),
        SpreadsheetColumnNotFoundError,
      );
      expect((await caller.runAi.byId({ id: created.id })).status).toBe(
        "pending",
      );
    });
  },
);

describe.skipIf(!dbUp)("runAi.listByBatch", () => {
  it("returns the batch's runs oldest first and excludes other batches", async () => {
    const batchId = `contract-batch-${crypto.randomUUID()}`;
    const first = await makeRun({ batchId, cellId: "s.cell.0.0" });
    const second = await makeRun({ batchId, cellId: "s.cell.1.0" });
    const third = await makeRun({ batchId, cellId: "s.cell.2.0" });
    await makeRun({ cellId: "s.cell.9.9" }); // a different batch

    const runs = await caller.runAi.listByBatch({ batchId });
    expect(runs.map((run) => run.id)).toEqual([first.id, second.id, third.id]);
    for (const run of runs) {
      expect(run.batchId).toBe(batchId);
      expect(run.status).toBe("pending");
      expectDate(run.createdAt);
    }
  });

  it("returns an empty list for an unknown batchId", async () => {
    const runs = await caller.runAi.listByBatch({
      batchId: `unknown-${crypto.randomUUID()}`,
    });
    expect(runs).toEqual([]);
  });

  it("rejects an empty batchId (BAD_REQUEST)", async () => {
    await expectTRPCError(
      caller.runAi.listByBatch({ batchId: "   " }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("listActiveBySpreadsheet (service)", () => {
  it("returns only the working runs of the sheet, one per cell", async () => {
    const sheet = `active-${crypto.randomUUID()}`;
    const working = await makeRun({ cellId: `${sheet}.cell.0.0` });
    const staged = await makeRun({
      cellId: `${sheet}.cell.1.0`,
      status: "analyzing",
    });
    const finished = await makeRun({ cellId: `${sheet}.cell.2.0` });
    await runAiService.complete(finished.id, { result: {} });
    const failed = await makeRun({ cellId: `${sheet}.cell.3.0` });
    await runAiService.fail(failed.id);
    await makeRun({ cellId: "other-sheet.cell.0.0" });

    const runs = await runAiService.listActiveBySpreadsheet(sheet);
    expect(runs.map((run) => run.id).sort()).toEqual(
      [working.id, staged.id].sort(),
    );
  });

  it("returns [] for a sheet with no runs", async () => {
    expect(await runAiService.listActiveBySpreadsheet("nowhere")).toEqual([]);
  });
});

describe.skipIf(!dbUp)("runAi.listActive", () => {
  it("returns the sheet's working runs — what tells a fresh page to stream", async () => {
    const sheet = `active-${crypto.randomUUID()}`;
    const working = await makeRun({ cellId: `${sheet}.cell.0.0` });
    const finished = await makeRun({ cellId: `${sheet}.cell.1.0` });
    await runAiService.fail(finished.id);
    const runs = await caller.runAi.listActive({ spreadsheetId: sheet });
    expect(runs.map((run) => run.id)).toEqual([working.id]);
    expect(await caller.runAi.listActive({ spreadsheetId: "nowhere" })).toEqual(
      [],
    );
  });

  it("rejects a blank spreadsheetId (BAD_REQUEST)", async () => {
    await expectTRPCError(
      caller.runAi.listActive({ spreadsheetId: " " }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("runAi.onChange", () => {
  /** A stream through its own abortable caller. */
  async function openStream(sheet: string, lastEventId?: string) {
    const controller = new AbortController();
    const stream = await callerWithSignal(controller.signal).runAi.onChange({
      spreadsheetId: sheet,
      ...(lastEventId !== undefined && { lastEventId }),
    });
    return { controller, events: stream[Symbol.asyncIterator]() };
  }

  it("rejects a blank spreadsheetId (BAD_REQUEST)", async () => {
    await expectTRPCError(
      caller.runAi.onChange({ spreadsheetId: " " }),
      "BAD_REQUEST",
    );
  });

  it("streams a snapshot, every change, then closes itself when the last run finishes", async () => {
    const sheet = `stream-${crypto.randomUUID()}`;
    const { controller, events } = await openStream(sheet);
    try {
      const snapshot = await nextTracked<RunAiChange>(events);
      expect(snapshot.data).toEqual({ type: "snapshot", runs: [] });
      expect(snapshot.id).toBe("0");

      const run = await makeRun({ cellId: `${sheet}.cell.4.0` });
      const created = await nextTracked<RunAiChange>(events);
      expect(created.data).toMatchObject({
        type: "run",
        run: { id: run.id, status: "pending", spreadsheetId: sheet },
      });
      expect(created.id).toBe(String(run.updatedAt.getTime()));

      await makeRun({ cellId: "elsewhere.cell.0.0" }); // another sheet: not streamed

      await runAiService.setStatus(run.id, { status: "analyzing" });
      const staged = await nextTracked<RunAiChange>(events);
      expect(staged.data).toMatchObject({
        type: "run",
        run: { id: run.id, status: "analyzing" },
      });

      const done = await runAiService.complete(run.id, {
        result: { answer: 42 },
      });
      const completed = await nextTracked<RunAiChange>(events);
      expect(completed.data).toMatchObject({
        type: "run",
        run: { id: run.id, status: "completed", result: { answer: 42 } },
      });
      expect(completed.id).toBe(String(done.updatedAt.getTime()));

      // Nothing is working any more: the stream ends.
      const closed = await nextTracked<RunAiChange>(events);
      expect(closed.data).toEqual({ type: "closed" });
      expect((await events.next()).done).toBe(true);

      // A reconnecting client replays from its last event id, then gets the
      // snapshot again — empty, the run is terminal — and stays open for
      // the next run.
      const resumed = await openStream(sheet, created.id);
      try {
        const replayed = await nextTracked<RunAiChange>(resumed.events);
        expect(replayed.data).toMatchObject({
          type: "run",
          run: { id: run.id, status: "completed" },
        });
        const resnapshot = await nextTracked<RunAiChange>(resumed.events);
        expect(resnapshot.data).toEqual({ type: "snapshot", runs: [] });
        expect(resnapshot.id).toBe(completed.id);
      } finally {
        resumed.controller.abort();
        await resumed.events.return?.();
      }
    } finally {
      controller.abort();
      await events.return?.();
    }
  });

  it("a fresh subscriber sees the working runs in its snapshot", async () => {
    const sheet = `snap-${crypto.randomUUID()}`;
    const working = await makeRun({ cellId: `${sheet}.cell.0.0` });
    const { controller, events } = await openStream(sheet);
    try {
      const snapshot = await nextTracked<RunAiChange>(events);
      expect(snapshot.data).toMatchObject({
        type: "snapshot",
        runs: [{ id: working.id, status: "pending" }],
      });
      expect(snapshot.id).toBe(String(working.updatedAt.getTime()));
    } finally {
      controller.abort();
      await events.return?.();
    }
  });

  it("stays open while another run of the sheet is still working", async () => {
    const sheet = `busy-${crypto.randomUUID()}`;
    await makeRun({ cellId: `${sheet}.cell.0.0` });
    const second = await makeRun({ cellId: `${sheet}.cell.1.0` });
    const { controller, events } = await openStream(sheet);
    try {
      await nextTracked<RunAiChange>(events); // snapshot
      // The two creates above may still be in flight as live events, so read
      // until the one we care about — a client applies events idempotently.
      const until = async (runId: string, status: string) => {
        for (;;) {
          const event = await nextTracked<RunAiChange>(events);
          expect(event.data.type).toBe("run"); // never `closed`
          if (
            event.data.type === "run" &&
            event.data.run.id === runId &&
            event.data.run.status === status
          ) {
            return event;
          }
        }
      };
      await runAiService.fail(second.id);
      await until(second.id, "failed");
      // No `closed`: the first run is still pending. Prove it by making
      // another change and reading it through.
      const third = await makeRun({ cellId: `${sheet}.cell.2.0` });
      await until(third.id, "pending");
    } finally {
      controller.abort();
      await events.return?.();
    }
  });
});

describe.skipIf(!dbUp)("REST surface", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address === "string" || address === null) {
      throw new Error("Expected the test server to bind a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (payload: unknown) =>
    fetch(`${baseUrl}/run-ai/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  /** What the endpoint answers: a run, or the filter's `{ statusCode, code, message }`. */
  type RestBody = {
    id: string;
    status: string;
    batchId: string;
    code?: string;
  } & Record<string, unknown>;
  const body = async (res: Response) => (await res.json()) as RestBody;

  it("creates, stages, completes and fails runs; maps every error", async () => {
    const cellId = `${sheetId}.cell.5.${textColumn}`;

    // create → 201 pending, batchId minted
    const createRes = await post({ cellId });
    expect(createRes.status).toBe(201);
    const created = await body(createRes);
    createdIds.push(created.id);
    expect(created).toMatchObject({
      cellId,
      spreadsheetId: sheetId,
      status: "pending",
      credit: 0,
      result: null,
    });
    expect(created.batchId).toMatch(/^test-/);

    // a second run for the busy cell → 409
    const busy = await post({ cellId, batchId: "b2" });
    expect(busy.status).toBe(409);
    expect((await body(busy)).code).toBe("RUN_AI_CELL_BUSY");

    // the same cell with a status → transitions its working run, 200
    const byCell = await post({ cellId, status: "running" });
    expect(byCell.status).toBe(200);
    expect(await body(byCell)).toMatchObject({
      id: created.id,
      status: "running",
    });

    // custom stage → 200, lowercase
    const staged = await post({ id: created.id, status: "Analyzing" });
    expect(staged.status).toBe(200);
    expect((await body(staged)).status).toBe("analyzing");

    // completed → cell written, 200
    const done = await post({
      id: created.id,
      status: "completed",
      result: { output: "Hello", usage: { totalTokens: 12 } },
      credit: 2,
    });
    expect(done.status).toBe(200);
    expect(await body(done)).toMatchObject({
      status: "completed",
      credit: 2,
      result: { output: "Hello", usage: { totalTokens: 12 } },
    });
    const cell = await caller.spreadsheet.cell({
      id: sheetId,
      rowIndex: 5,
      columnIndex: textColumn,
    });
    expect(cell.value).toBe("Hello");

    // failed → 200, cell untouched
    const secondRes = await post({ cellId, batchId: "b3", status: "running" });
    expect(secondRes.status).toBe(201);
    const second = await body(secondRes);
    createdIds.push(second.id);
    expect(second.status).toBe("running");
    const failed = await post({
      id: second.id,
      status: "failed",
      result: { error: "quota" },
    });
    expect(failed.status).toBe(200);
    expect(await body(failed)).toMatchObject({
      status: "failed",
      result: { error: "quota" },
    });
    expect(
      (
        await caller.spreadsheet.cell({
          id: sheetId,
          rowIndex: 5,
          columnIndex: textColumn,
        })
      ).value,
    ).toBe("Hello");

    // 404: unknown run, missing column
    const missing = await post({ id: crypto.randomUUID(), status: "running" });
    expect(missing.status).toBe(404);
    expect((await body(missing)).code).toBe("RUN_AI_NOT_FOUND");
    const orphanRes = await post({ cellId: `${sheetId}.cell.6.999` });
    const orphan = await body(orphanRes);
    createdIds.push(orphan.id);
    const noColumn = await post({
      id: orphan.id,
      status: "completed",
      result: { output: "x" },
    });
    expect(noColumn.status).toBe(404);
    expect((await body(noColumn)).code).toBe("SPREADSHEET_COLUMN_NOT_FOUND");

    // 400: validation and domain
    const noCell = await post({ batchId: "b" });
    expect(noCell.status).toBe(400);
    expect((await body(noCell)).code).toBe("VALIDATION_FAILED");
    const noStatus = await post({ id: created.id });
    expect(noStatus.status).toBe(400);
    // a terminal status for a cell with no working run → created, then
    // transitioned straight on (201, and the output lands in the cell)
    const oneShot = await post({
      cellId: `${sheetId}.cell.7.${textColumn}`,
      status: "completed",
      result: { output: "one shot" },
    });
    expect(oneShot.status).toBe(201);
    const oneShotRun = await body(oneShot);
    createdIds.push(oneShotRun.id);
    expect(oneShotRun.status).toBe("completed");
    expect(
      (
        await caller.spreadsheet.cell({
          id: sheetId,
          rowIndex: 7,
          columnIndex: textColumn,
        })
      ).value,
    ).toBe("one shot");
    const badWord = await post({ id: created.id, status: "two words" });
    expect(badWord.status).toBe(400);
    const badCell = await post({ cellId: "nonsense" });
    expect(badCell.status).toBe(400);
    expect((await body(badCell)).code).toBe("RUN_AI_INVALID_CELL_ID");
    const flagRes = await post({ cellId: `${sheetId}.cell.8.${boolColumn}` });
    const flag = await body(flagRes);
    createdIds.push(flag.id);
    const mismatch = await post({
      id: flag.id,
      status: "completed",
      result: { output: "not a bool" },
    });
    expect(mismatch.status).toBe(400);
    expect((await body(mismatch)).code).toBe("SPREADSHEET_CELL_TYPE_MISMATCH");
  });
});
