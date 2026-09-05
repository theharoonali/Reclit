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
 *   result: ({ input?: RunAiInput; output?: CellValue } & Record<string, unknown>) | null;
 *   createdAt: Date; updatedAt: Date;
 * }
 * RunAiInput = {                          // what a run is given; `result.input` and the job payload
 *   prompt: string;                       // the column's prompt — the instruction
 *   target: { id: "col.<i>"; index; name; type: ColumnType };
 *   row: { id: "row.<r>"; index; cells: RunAiInputCell[] };   // EVERY column, in sort order
 * }
 * RunAiInputCell = { id: "col.<i>"; index; name; type: ColumnType; value: CellValue }  // blank = null
 * RunAiJobPayload = { runId: string; input: RunAiInput }       // the Trigger.dev `run-ai-cell` payload
 * RunAiChange =
 *   | { type: "snapshot"; runs: RunAi[] }   // every working run of the sheet, newest per cell
 *   | { type: "run"; run: RunAi }           // one run after an insert or update
 *   | { type: "closed" }                    // the last working run finished; last event, the stream ends
 * Dates cross the wire as real Date objects (superjson). Status is lowercase
 * on the wire and uppercase in the database.
 *
 * PROCEDURES
 * | Procedure         | Kind         | Payload                                        | Response                       | Errors                                            |
 * | ----------------- | ------------ | ---------------------------------------------- | ------------------------------ | ------------------------------------------------- |
 * | runAi.byId        | query        | { id: string }                                 | RunAi                          | NOT_FOUND, BAD_REQUEST                            |
 * | runAi.listByBatch | query        | { batchId: string }                            | RunAi[]                        | BAD_REQUEST                                       |
 * | runAi.listActive  | query        | { spreadsheetId: string }                      | RunAi[] (working runs)         | BAD_REQUEST                                       |
 * | runAi.runCell     | mutation     | { id: sheetId; rowIndex: number; columnIndex } | RunAi (pending, result.input)  | BAD_REQUEST, NOT_FOUND, CONFLICT, BAD_GATEWAY     |
 * | runAi.onChange    | subscription | { spreadsheetId: string; lastEventId? }        | SSE of tracked RunAiChange     | BAD_REQUEST                                       |
 *
 * NOTES
 * - `runCell` runs one AI cell. The column must carry `node: "ai"` and a
 *   `prompt`, else BAD_REQUEST (`RUN_AI_COLUMN_NOT_RUNNABLE`); an unknown
 *   sheet or column is NOT_FOUND. It records the run `pending` with
 *   `result: { input }` — `input.row.cells` is every column of the sheet in
 *   its display (`sortOrder`) order, blank cells `value: null`, the target
 *   included with its current value; audio/file/url cells hold their URL
 *   (the worker fetches and attaches them) — then
 *   hands `{ runId, input }` to the Trigger.dev worker (`batchId` is minted
 *   `run-<uuid>`, one run per batch for now). The response is the run as
 *   created; every later transition arrives through `onChange`. A cell that
 *   already has a working run is CONFLICT (`RUN_AI_CELL_BUSY`); once that
 *   run is `completed` or `failed` the cell can be run again, as many times
 *   as wanted — each run is a new row. When the
 *   worker cannot be reached the run is flipped to `failed` with
 *   `result.error: { name, message }` and the call is BAD_GATEWAY
 *   (`RUN_AI_DISPATCH_FAILED`). With no worker registered (tests, an api
 *   started without `TRIGGER_SECRET_KEY`'s dispatcher) the run stays pending.
 * - The worker (`src/trigger/run-ai-cell.ts`) moves the run to `running`,
 *   fetches every audio / file / url cell of the row (http(s) values, ≤ 15 MB,
 *   30 s each) and attaches them to the model call as files — a link that
 *   cannot be fetched is noted in the prompt instead — asks Gemini with the
 *   column prompt as the instruction and the row as context, and
 *   `complete`s with `result: { input, output, model, usage, attachments }`
 *   (`attachments`: `{ columnId, filename, mediaType, bytes }` per fetched
 *   file, `{ columnId, url, error }` per failure) — `output` typed like the
 *   column (string, number, boolean, ISO date string, JSON object, email,
 *   URL) — or `fail`s with `result: { input, error }`. `markRunning` never
 *   revives a finished run (`RUN_AI_FINISHED`, conflict).
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
 * - `listByBatch` is createdAt ascending; an unknown batchId returns `[]`.
 * - `cellId` must parse as "<sheetId>.cell.<r>.<c>" (`RUN_AI_INVALID_CELL_ID`
 *   otherwise) but is never validated against Cell — the cell may be gone.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  collectAttachments,
  type FetchLike,
  filenameOf,
  isAttachableCell,
  MAX_ATTACHMENT_BYTES,
  mediaTypeFor,
  summariseAttachments,
} from "../ai/cell-attachments";
import {
  buildCellMessages,
  cellOutputSchema,
  formatCellLine,
} from "../ai/cell-prompt";
import { pingDatabase, prisma } from "../db/prisma";
import {
  RunAiCellBusyError,
  RunAiFinishedError,
  RunAiInvalidCellIdError,
  RunAiNotFoundError,
} from "../modules/run-ai/run-ai.errors";
import { runAiFeed } from "../modules/run-ai/run-ai.feed";
import type {
  CreateRunAiInput,
  RunAiChange,
  RunAiInput,
  RunAiInputCell,
  RunAiJobPayload,
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
  expectError,
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
    await expectError(
      runAiService.setStatus(first.id, { status: "analyzing" }),
      RunAiCellBusyError,
    );
  });

  it("markRunning never revives a finished run (RunAiFinishedError)", async () => {
    const run = await makeRun();
    await runAiService.fail(run.id, {
      result: { error: "dispatch timed out" },
    });
    const error = await expectError(
      runAiService.markRunning(run.id),
      RunAiFinishedError,
    );
    expect(error.code).toBe("RUN_AI_FINISHED");
    const stored = await caller.runAi.byId({ id: run.id });
    expect(stored.status).toBe("failed");
    expect(stored.result).toEqual({ error: "dispatch timed out" });
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

describe.skipIf(!dbUp)("runAi.runCell", () => {
  // Its own sheet: the column layout below is what the tests assert on.
  // Display order after the reorder: Name | Summary (AI) | Notes (json) |
  // Voice (audio) — while the AI column's *index* stays 1.
  let sheet = "";
  let aiColumn = 0;
  let noteColumn = 0;
  let voiceColumn = 0;
  let plainColumn = 0;
  let mutePromptColumn = 0;
  const dispatched: RunAiJobPayload[] = [];

  beforeAll(async () => {
    const workspace = await makeWorkspace("run-ai runCell");
    sheet = workspace.spreadsheetId ?? "";
    plainColumn = (
      await caller.spreadsheet.createColumn({ id: sheet, name: "Name" })
    ).index;
    aiColumn = (
      await caller.spreadsheet.createColumn({
        id: sheet,
        name: "Summary",
        node: "ai",
        prompt: "Summarise the row in five words.",
      })
    ).index;
    const voice = await caller.spreadsheet.createColumn({
      id: sheet,
      name: "Voice",
      type: "audio",
    });
    voiceColumn = voice.index;
    noteColumn = (
      await caller.spreadsheet.createColumn({
        id: sheet,
        name: "Notes",
        type: "json",
      })
    ).index;
    mutePromptColumn = (
      await caller.spreadsheet.createColumn({
        id: sheet,
        name: "Silent",
        node: "ai",
      })
    ).index;
    // Move Notes before Voice so sort order and index disagree.
    await caller.spreadsheet.reorderColumn({
      id: sheet,
      columnIndex: noteColumn,
      newSortOrder: voice.sortOrder,
    });
    await caller.spreadsheet.updateRow({
      id: sheet,
      rowIndex: 0,
      cells: [
        { columnIndex: plainColumn, value: "Ada" },
        { columnIndex: voice.index, value: "https://files.test/ada.mp3" },
        { columnIndex: noteColumn, value: { mood: "curious" } },
        { columnIndex: aiColumn, value: "stale summary" },
      ],
    });
  });

  afterAll(async () => {
    runAiService.setDispatcher(null);
    if (sheet) {
      await prisma.runAi.deleteMany({ where: { spreadsheetId: sheet } });
      const workspace = await prisma.spreadsheet.findUnique({
        where: { id: sheet },
        select: { workspaceId: true },
      });
      if (workspace) await removeWorkspace(workspace.workspaceId);
    }
  });

  const runCell = (rowIndex: number, columnIndex = aiColumn) =>
    caller.runAi.runCell({ id: sheet, rowIndex, columnIndex });

  it("creates a pending run whose result.input is the whole row in sort order, and dispatches it", async () => {
    dispatched.length = 0;
    runAiService.setDispatcher(async (payload) => {
      dispatched.push(payload);
    });
    const run = await runCell(0);
    expect(run).toMatchObject({
      cellId: `${sheet}.cell.0.${aiColumn}`,
      spreadsheetId: sheet,
      status: "pending",
      credit: 0,
    });
    expect(run.batchId).toMatch(/^run-/);
    expectDate(run.createdAt);

    const input = run.result?.input as RunAiInput;
    expect(input.prompt).toBe("Summarise the row in five words.");
    expect(input.target).toEqual({
      id: `col.${aiColumn}`,
      index: aiColumn,
      name: "Summary",
      type: "string",
    });
    expect(input.row.id).toBe("row.0");
    expect(input.row.index).toBe(0);
    // Every column, display order (Notes moved before Voice), blanks null,
    // the target with its current value, the audio cell as its URL.
    expect(input.row.cells).toEqual([
      {
        id: `col.${plainColumn}`,
        index: plainColumn,
        name: "Name",
        type: "string",
        value: "Ada",
      },
      {
        id: `col.${aiColumn}`,
        index: aiColumn,
        name: "Summary",
        type: "string",
        value: "stale summary",
      },
      {
        id: `col.${noteColumn}`,
        index: noteColumn,
        name: "Notes",
        type: "json",
        value: { mood: "curious" },
      },
      {
        id: `col.${voiceColumn}`,
        index: voiceColumn,
        name: "Voice",
        type: "audio",
        value: "https://files.test/ada.mp3",
      },
      {
        id: `col.${mutePromptColumn}`,
        index: mutePromptColumn,
        name: "Silent",
        type: "string",
        value: null,
      },
    ]);

    // The worker got exactly what was stored.
    expect(dispatched).toEqual([{ runId: run.id, input }]);
    // And the row is readable back through byId unchanged.
    const stored = await caller.runAi.byId({ id: run.id });
    expect(stored.result).toEqual({ input });
  });

  it("a never-written row still yields one null entry per column", async () => {
    runAiService.setDispatcher(null);
    const run = await runCell(7);
    const input = run.result?.input as RunAiInput;
    expect(input.row.cells.map((cell) => cell.value)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(input.row.cells.map((cell) => cell.name)).toEqual([
      "Name",
      "Summary",
      "Notes",
      "Voice",
      "Silent",
    ]);
  });

  it("without a dispatcher the run simply stays pending", async () => {
    runAiService.setDispatcher(null);
    const run = await runCell(1);
    expect((await caller.runAi.byId({ id: run.id })).status).toBe("pending");
  });

  it("a dispatcher that throws fails the run and answers BAD_GATEWAY", async () => {
    runAiService.setDispatcher(async () => {
      throw new Error("TRIGGER_SECRET_KEY is not set");
    });
    await expectTRPCError(runCell(2), "BAD_GATEWAY");
    const [run] = await prisma.runAi.findMany({
      where: { cellId: `${sheet}.cell.2.${aiColumn}` },
    });
    expect(run?.status).toBe("FAILED");
    expect(run?.result).toMatchObject({
      error: { name: "Error", message: "TRIGGER_SECRET_KEY is not set" },
    });
    expect((run?.result as { input?: RunAiInput }).input?.prompt).toBe(
      "Summarise the row in five words.",
    );
    runAiService.setDispatcher(null);
  });

  it("refuses a plain column and an AI column without a prompt (BAD_REQUEST)", async () => {
    await expectTRPCError(runCell(3, plainColumn), "BAD_REQUEST");
    await expectTRPCError(runCell(3, mutePromptColumn), "BAD_REQUEST");
  });

  it("returns NOT_FOUND for an unknown column and an unknown sheet", async () => {
    await expectTRPCError(runCell(3, 999), "NOT_FOUND");
    await expectTRPCError(
      caller.runAi.runCell({
        id: crypto.randomUUID(),
        rowIndex: 0,
        columnIndex: 0,
      }),
      "NOT_FOUND",
    );
  });

  it("a cell that already has a working run is CONFLICT; once it finishes the cell can run again", async () => {
    runAiService.setDispatcher(null);
    const first = await runCell(4);
    await expectTRPCError(runCell(4), "CONFLICT");
    await runAiService.fail(first.id);
    const second = await runCell(4);
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("pending");
    await runAiService.complete(second.id, { result: { output: "done" } });
    expect((await runCell(4)).status).toBe("pending");
  });

  it("rejects a negative or fractional address (BAD_REQUEST)", async () => {
    await expectTRPCError(runCell(-1), "BAD_REQUEST");
    await expectTRPCError(runCell(1.5), "BAD_REQUEST");
  });
});

describe("run-ai-cell task prompt (pure)", () => {
  const input: RunAiInput = {
    prompt: "Write a greeting for this person.",
    target: { id: "col.2", index: 2, name: "Greeting", type: "string" },
    row: {
      id: "row.4",
      index: 4,
      cells: [
        { id: "col.0", index: 0, name: "Name", type: "string", value: "Ada" },
        { id: "col.3", index: 3, name: "Age", type: "number", value: 36 },
        {
          id: "col.1",
          index: 1,
          name: "Tags",
          type: "json",
          value: { vip: true },
        },
        {
          id: "col.2",
          index: 2,
          name: "Greeting",
          type: "string",
          value: null,
        },
        {
          id: "col.4",
          index: 4,
          name: "Voice",
          type: "audio",
          value: "https://files.test/ada.mp3",
        },
      ],
    },
  };

  it("renders one line per cell in the given order, blanks and JSON included", () => {
    expect(input.row.cells.map((cell) => formatCellLine(cell))).toEqual([
      "Name (string): Ada",
      "Age (number): 36",
      'Tags (json): {"vip":true}',
      "Greeting (string): (empty)",
      "Voice (audio): https://files.test/ada.mp3",
    ]);
  });

  it("names an attached file, or says why a URL could not be fetched", () => {
    const voice = input.row.cells[4];
    if (!voice) throw new Error("fixture");
    expect(
      formatCellLine(voice, { kind: "attached", filename: "ada.mp3" }),
    ).toBe('Voice (audio): attached file "ada.mp3"');
    expect(formatCellLine(voice, { kind: "failed", error: "HTTP 404" })).toBe(
      "Voice (audio): https://files.test/ada.mp3 (could not be fetched: HTTP 404)",
    );
  });

  it("puts the column prompt in the instruction and the row in the context", () => {
    const { system, prompt } = buildCellMessages(input);
    expect(system).toContain("Write a greeting for this person.");
    expect(system).toContain('"Greeting"');
    expect(system).toContain("type: string");
    expect(system).not.toContain("attached files");
    expect(prompt).toContain("Row 5:");
    for (const cell of input.row.cells) {
      expect(prompt).toContain(formatCellLine(cell));
    }
    expect(prompt.indexOf("Name (string)")).toBeLessThan(
      prompt.indexOf("Age (number)"),
    );
    expect(prompt).toContain('Fill the column "Greeting".');
    const withFile = buildCellMessages(
      input,
      new Map([["col.4", { kind: "attached", filename: "ada.mp3" }]]),
    );
    expect(withFile.system).toContain("including the attached files");
    expect(withFile.prompt).toContain('Voice (audio): attached file "ada.mp3"');
  });

  it("attaches audio, file and url cells that hold an http(s) URL — nothing else", () => {
    const cell = (type: RunAiInput["target"]["type"], value: unknown) =>
      ({ id: "col.9", index: 9, name: "X", type, value }) as RunAiInputCell;
    expect(isAttachableCell(cell("audio", "https://a.test/x.mp3"))).toBe(true);
    expect(isAttachableCell(cell("file", "http://a.test/x.pdf"))).toBe(true);
    expect(isAttachableCell(cell("url", "https://example.com/"))).toBe(true);
    expect(isAttachableCell(cell("string", "https://a.test/x.pdf"))).toBe(
      false,
    );
    expect(isAttachableCell(cell("file", "ftp://a.test/x.pdf"))).toBe(false);
    expect(isAttachableCell(cell("audio", null))).toBe(false);
  });

  it("names the file after the URL's last segment and picks a media type", () => {
    expect(filenameOf("https://files.test/voice/ada%20intro.mp3")).toBe(
      "ada intro.mp3",
    );
    expect(filenameOf("https://example.com/")).toBe("example.com");
    expect(mediaTypeFor("https://a.test/x.mp3", "audio/mpeg; charset=x")).toBe(
      "audio/mpeg",
    );
    expect(
      mediaTypeFor("https://a.test/x.mp3", "application/octet-stream"),
    ).toBe("audio/mpeg");
    expect(mediaTypeFor("https://a.test/x.pdf", null)).toBe("application/pdf");
    expect(
      mediaTypeFor("https://example.com/", "text/html;charset=utf-8"),
    ).toBe("text/html");
    expect(mediaTypeFor("https://a.test/x.zzz", null)).toBe(
      "application/octet-stream",
    );
  });

  it("collects the fetched files, and records why the others failed, without throwing", async () => {
    const responses: Record<
      string,
      { status: number; type: string; body: Uint8Array }
    > = {
      "https://files.test/ada.mp3": {
        status: 200,
        type: "audio/mpeg",
        body: new Uint8Array([1, 2, 3]),
      },
      "https://files.test/missing.pdf": {
        status: 404,
        type: "text/html",
        body: new Uint8Array(),
      },
      "https://files.test/huge.bin": {
        status: 200,
        type: "application/octet-stream",
        body: new Uint8Array(MAX_ATTACHMENT_BYTES + 1),
      },
    };
    const fakeFetch: FetchLike = async (url) => {
      const hit = responses[url];
      if (!hit) throw new Error("connection refused");
      return {
        ok: hit.status < 400,
        status: hit.status,
        headers: {
          get: (name: string) => (name === "content-type" ? hit.type : null),
        },
        arrayBuffer: async () => hit.body.buffer as ArrayBuffer,
      };
    };
    const cells: RunAiInputCell[] = [
      { id: "col.0", index: 0, name: "Name", type: "string", value: "Ada" },
      {
        id: "col.1",
        index: 1,
        name: "Voice",
        type: "audio",
        value: "https://files.test/ada.mp3",
      },
      {
        id: "col.2",
        index: 2,
        name: "CV",
        type: "file",
        value: "https://files.test/missing.pdf",
      },
      {
        id: "col.3",
        index: 3,
        name: "Blob",
        type: "file",
        value: "https://files.test/huge.bin",
      },
      {
        id: "col.4",
        index: 4,
        name: "Site",
        type: "url",
        value: "https://down.test/",
      },
    ];
    const attachments = await collectAttachments(cells, fakeFetch);
    expect(
      attachments.files.map((f) => [
        f.columnId,
        f.filename,
        f.mediaType,
        f.data.byteLength,
      ]),
    ).toEqual([["col.1", "ada.mp3", "audio/mpeg", 3]]);
    expect(attachments.failures).toEqual([
      {
        columnId: "col.2",
        url: "https://files.test/missing.pdf",
        error: "HTTP 404",
      },
      {
        columnId: "col.3",
        url: "https://files.test/huge.bin",
        error: `larger than ${MAX_ATTACHMENT_BYTES} bytes`,
      },
      {
        columnId: "col.4",
        url: "https://down.test/",
        error: "connection refused",
      },
    ]);
    expect(summariseAttachments(attachments)[0]).toEqual({
      columnId: "col.1",
      filename: "ada.mp3",
      mediaType: "audio/mpeg",
      bytes: 3,
    });
  });

  it("describes the answer shape per column type, free JSON for json", () => {
    expect(cellOutputSchema("number")?.safeParse({ value: 3 }).success).toBe(
      true,
    );
    expect(cellOutputSchema("number")?.safeParse({ value: "3" }).success).toBe(
      false,
    );
    expect(
      cellOutputSchema("boolean")?.safeParse({ value: true }).success,
    ).toBe(true);
    for (const type of [
      "string",
      "formula",
      "date",
      "email",
      "url",
      "audio",
      "file",
    ] as const) {
      expect(cellOutputSchema(type)?.safeParse({ value: "x" }).success).toBe(
        true,
      );
      expect(cellOutputSchema(type)?.safeParse({ value: 1 }).success).toBe(
        false,
      );
    }
    expect(cellOutputSchema("json")).toBeNull();
  });
});
