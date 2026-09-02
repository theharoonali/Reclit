/**
 * CONTRACT — run-ai
 * Feature doc: docs/features/run-ai.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `RunAi`
 *   id         String       pk, uuid
 *   cellId     String       scoped Cell pk "<sheetId>.cell.<r>.<c>"; plain string (no fk), indexed
 *   batchId    String       required, indexed
 *   status     RunAiStatus  PENDING | RUNNING | COMPLETED | FAILED, default PENDING
 *   credit     Int          default 0
 *   result     Json?        object or null
 *   createdAt  DateTime     now(), indexed
 *   updatedAt  DateTime     @updatedAt
 *
 * MODEL  RunAi = {
 *   id: string; cellId: string; batchId: string;
 *   status: "pending" | "running" | "completed" | "failed";
 *   credit: number; result: Record<string, unknown> | null;
 *   createdAt: Date; updatedAt: Date;
 * }
 * Dates cross the wire as real Date objects (superjson). Status is lowercase
 * on the wire (the database enum is its uppercase mirror).
 *
 * PROCEDURES
 * | Procedure         | Kind  | Payload             | Response | Errors                 |
 * | ----------------- | ----- | ------------------- | -------- | ---------------------- |
 * | runAi.byId        | query | { id: string }      | RunAi    | NOT_FOUND, BAD_REQUEST |
 * | runAi.listByBatch | query | { batchId: string } | RunAi[]  | BAD_REQUEST            |
 *
 * NOTES
 * - `listByBatch` is createdAt ascending; an unknown batchId returns `[]`,
 *   not NOT_FOUND. `batchId` must be non-blank (trimmed) and <= 200 chars.
 * - There are no write procedures. Rows are created and transitioned
 *   in-process by `RunAiService.create` / `markRunning` / `complete` / `fail`
 *   (the spreadsheet service or a Trigger.dev task); this file stages rows the
 *   same way. `create` starts a run at `pending` with `credit` 0 unless given;
 *   `complete` sets `result` and optionally `credit`; `fail` optionally sets
 *   `result`. A transition on a missing id throws `RunAiNotFoundError`.
 * - `cellId` is never validated against Cell — the cell may already be gone.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { pingDatabase, prisma } from "../db/prisma";
import { RunAiNotFoundError } from "../modules/run-ai/run-ai.errors";
import type { CreateRunAiInput } from "../modules/run-ai/run-ai.schema";
import { runAiService } from "../modules/run-ai/run-ai.service";
import { caller, expectDate, expectTRPCError } from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

const createdIds: string[] = [];

/** Stages a run through the service — the only writer there is. */
async function makeRun(over: Partial<CreateRunAiInput> = {}) {
  const run = await runAiService.create({
    cellId: "contract-sheet.cell.0.0",
    batchId: `contract-batch-${crypto.randomUUID()}`,
    ...over,
  });
  createdIds.push(run.id);
  return run;
}

afterAll(async () => {
  if (createdIds.length === 0) return;
  await prisma.runAi
    .deleteMany({ where: { id: { in: createdIds } } })
    .catch(() => {});
});

describe.skipIf(!dbUp)("runAi.byId", () => {
  it("reads back a run created with the minimal payload and its defaults", async () => {
    const created = await makeRun();
    const run = await caller.runAi.byId({ id: created.id });
    expect(run).toMatchObject({
      id: created.id,
      cellId: "contract-sheet.cell.0.0",
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
    });
    const run = await caller.runAi.byId({ id: created.id });
    expect(run).toMatchObject({
      cellId: "contract-sheet.cell.3.2",
      credit: 3,
      status: "pending",
    });
  });

  it("reflects markRunning", async () => {
    const created = await makeRun();
    await runAiService.markRunning(created.id);
    const run = await caller.runAi.byId({ id: created.id });
    expect(run.status).toBe("running");
    expect(run.result).toBeNull();
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
    let caught: unknown;
    try {
      await runAiService.markRunning(crypto.randomUUID());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RunAiNotFoundError);
  });
});

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
