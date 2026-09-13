/**
 * CONTRACT — external-api
 * Feature doc: docs/features/external-api.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `ExternalApi`
 *   id         String    pk, uuid
 *   cellId     String    fk -> Cell.id (scoped "<sheetId>.cell.<r>.<c>"), ON DELETE CASCADE
 *   input      String    the source the result came from (file URL, website URL,
 *                        file name), 1..2000 chars, NOT unique
 *   output     Json      required object; `output.kind` names what produced it
 *   createdAt  DateTime  now()
 *   updatedAt  DateTime  @updatedAt
 *   Indexes: [cellId, input] (the lookup), [cellId, createdAt] (the list),
 *            [input, createdAt] (the cross-cell lookup).
 *
 * MODEL  ExternalApi = {
 *   id: string; cellId: string; input: string;
 *   output: { kind: string } & Record<string, unknown>;
 *   createdAt: Date; updatedAt: Date;
 * }
 * Dates cross the wire as real Date objects (superjson).
 *
 * KINDS  `output.kind` values in use. Each one's shape is declared in
 * `modules/external-api/external-api.schema.ts`; a reader switches on `kind`.
 *   "audio-transcription"  { kind; provider; model; text; languageCode: string | null;
 *                            filename; mediaType; bytes }
 *   "website-crawl"        { kind; provider; crawlId; url; options: { limit; maxDiscoveryDepth;
 *                            allowSubdomains; crawlEntireDomain }; pages: { url; title: string | null;
 *                            statusCode: number | null; characters; markdown }[]; total; completed;
 *                            creditsUsed: number | null; crawledAt: ISO string }  — Firecrawl over a
 *                            url cell's website (`src/ai/cell-crawls.ts`, the `crawl-website` task)
 *
 * PROCEDURES
 * | Procedure                | Kind  | Payload              | Response                | Errors                 |
 * | ------------------------ | ----- | -------------------- | ----------------------- | ---------------------- |
 * | externalApi.byId         | query | { id: string }       | ExternalApi             | NOT_FOUND, BAD_REQUEST |
 * | externalApi.listByCell   | query | { cellId: string }   | ExternalApi[], newest first | BAD_REQUEST        |
 *
 * NOTES
 * - Read-only over tRPC. The writers are the processors inside the Trigger.dev
 *   worker: `src/ai/cell-transcripts.ts` and `src/ai/cell-crawls.ts` (the
 *   latter through the `crawl-website` task) today.
 * - `listByCell` is `createdAt` descending. An unknown or cell-less id returns
 *   `[]`, never NOT_FOUND — a cell that was cleared has no results by
 *   definition.
 * - **Deletion is a cascade, never a call.** There is no remove procedure:
 *   deleting the Cell row deletes its results, and a Cell row is deleted by
 *   clearing the cell (`spreadsheet.setCell` with `null`), deleting its row,
 *   deleting the column, deleting the sheet, or re-importing the sheet.
 * - Service surface (in-process callers — the worker):
 *     `find({ cellId, input })`      -> newest match or null
 *     `findByInput(input)`           -> newest match for that source in ANY cell, or null
 *     `listByCell(cellId)`           -> the list above
 *     `byId(id)`                     -> EXTERNAL_API_NOT_FOUND when missing
 *     `save({ cellId, input, output })` -> replaces the newest match under that
 *                                       key, else creates; a cellId with no Cell
 *                                       row is EXTERNAL_API_CELL_NOT_FOUND
 *                                       (the foreign key)
 *     `resolve(key, produce, accept?, { anyCell? })` -> `{ record, reused }`:
 *                                       the stored result when one exists and
 *                                       `accept` takes it; with `anyCell`, else
 *                                       an accepted result any other cell holds
 *                                       for the same `input`, COPIED under the
 *                                       key (so it cascades with this cell) and
 *                                       reported as reused; otherwise
 *                                       `produce()`'s, saved under the key
 * - `input` is a reference, never a payload: 2000 characters, blanks rejected.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { pingDatabase, prisma } from "../db/prisma";
import {
  ExternalApiCellNotFoundError,
  ExternalApiNotFoundError,
} from "../modules/external-api/external-api.errors";
import type { ExternalApiOutput } from "../modules/external-api/external-api.schema";
import { EXTERNAL_API_KINDS } from "../modules/external-api/external-api.schema";
import { externalApiService } from "../modules/external-api/external-api.service";
import { cellId } from "../modules/spreadsheet/spreadsheet.ids";
import { spreadsheetService } from "../modules/spreadsheet/spreadsheet.service";
import { makeWorkspace, removeWorkspace } from "./support/fixtures";
import {
  caller,
  expectDate,
  expectError,
  expectTRPCError,
} from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

const createdSheetIds: string[] = [];
let workspaceId = "";
if (dbUp) {
  workspaceId = (await makeWorkspace("external-api contract host")).id;
}

/** A sheet with one audio column, and one row holding a file URL in it. */
async function makeSheetWithAudioCell(url = "https://files.test/ada.mp3") {
  const sheet = await caller.spreadsheet.create({
    name: "external-api sheet",
    workspaceId,
  });
  createdSheetIds.push(sheet.id);
  const column = await caller.spreadsheet.createColumn({
    id: sheet.id,
    name: "Voice",
    type: "audio",
  });
  await caller.spreadsheet.setCell({
    id: sheet.id,
    rowIndex: 0,
    columnIndex: column.index,
    value: url,
  });
  return {
    sheetId: sheet.id,
    columnIndex: column.index,
    cellId: cellId(sheet.id, 0, column.index),
    url,
  };
}

const transcript = (text: string): ExternalApiOutput => ({
  kind: EXTERNAL_API_KINDS.audioTranscription,
  provider: "elevenlabs",
  model: "scribe_v1",
  text,
  languageCode: "en",
  filename: "ada.mp3",
  mediaType: "audio/mpeg",
  bytes: 3,
});

afterAll(async () => {
  for (const id of createdSheetIds) {
    await spreadsheetService.remove(id).catch(() => {});
  }
  if (workspaceId) await removeWorkspace(workspaceId);
});

describe.skipIf(!dbUp)("ExternalApiService.save", () => {
  it("stores a result under (cellId, input) and reads it back", async () => {
    const cell = await makeSheetWithAudioCell();
    const saved = await externalApiService.save({
      cellId: cell.cellId,
      input: cell.url,
      output: transcript("Hello from Ada."),
    });
    expect(saved).toMatchObject({ cellId: cell.cellId, input: cell.url });
    expect(saved.output).toMatchObject({
      kind: "audio-transcription",
      text: "Hello from Ada.",
      languageCode: "en",
    });
    expectDate(saved.createdAt);
    expectDate(saved.updatedAt);

    const found = await externalApiService.find({
      cellId: cell.cellId,
      input: cell.url,
    });
    expect(found?.id).toBe(saved.id);
  });

  it("replaces the stored result for the same key rather than appending", async () => {
    const cell = await makeSheetWithAudioCell();
    const first = await externalApiService.save({
      cellId: cell.cellId,
      input: cell.url,
      output: transcript("first"),
    });
    const second = await externalApiService.save({
      cellId: cell.cellId,
      input: cell.url,
      output: transcript("second"),
    });
    expect(second.id).toBe(first.id);
    expect(second.output).toMatchObject({ text: "second" });
    expect(await externalApiService.listByCell(cell.cellId)).toHaveLength(1);
  });

  it("keeps a second source of the same cell as its own row", async () => {
    const cell = await makeSheetWithAudioCell();
    await externalApiService.save({
      cellId: cell.cellId,
      input: cell.url,
      output: transcript("one"),
    });
    await externalApiService.save({
      cellId: cell.cellId,
      input: "https://files.test/other.mp3",
      output: transcript("two"),
    });
    expect(await externalApiService.listByCell(cell.cellId)).toHaveLength(2);
  });

  it("refuses a cellId with no Cell row (the foreign key)", async () => {
    await expectError(
      externalApiService.save({
        cellId: "no-such-sheet.cell.0.0",
        input: "https://files.test/ada.mp3",
        output: transcript("orphan"),
      }),
      ExternalApiCellNotFoundError,
    );
  });
});

describe.skipIf(!dbUp)("ExternalApiService.find", () => {
  it("answers null for a source that was never processed", async () => {
    const cell = await makeSheetWithAudioCell();
    expect(
      await externalApiService.find({
        cellId: cell.cellId,
        input: "https://files.test/never.mp3",
      }),
    ).toBeNull();
  });
});

describe.skipIf(!dbUp)("ExternalApiService.resolve", () => {
  it("produces and stores on a miss, then reuses without producing again", async () => {
    const cell = await makeSheetWithAudioCell();
    let calls = 0;
    const produce = async () => {
      calls += 1;
      return transcript("produced once");
    };

    const miss = await externalApiService.resolve(
      { cellId: cell.cellId, input: cell.url },
      produce,
    );
    expect(miss.reused).toBe(false);
    expect(calls).toBe(1);

    const hit = await externalApiService.resolve(
      { cellId: cell.cellId, input: cell.url },
      produce,
    );
    expect(hit.reused).toBe(true);
    expect(hit.record.id).toBe(miss.record.id);
    expect(hit.record.output).toMatchObject({ text: "produced once" });
    expect(calls).toBe(1);
  });

  it("re-produces a stored result its `accept` predicate refuses", async () => {
    const cell = await makeSheetWithAudioCell();
    await externalApiService.save({
      cellId: cell.cellId,
      input: cell.url,
      output: { kind: "something-else" },
    });
    const { record, reused } = await externalApiService.resolve(
      { cellId: cell.cellId, input: cell.url },
      async () => transcript("re-produced"),
      (output) => output.kind === EXTERNAL_API_KINDS.audioTranscription,
    );
    expect(reused).toBe(false);
    expect(record.output).toMatchObject({ text: "re-produced" });
  });
});

describe.skipIf(!dbUp)("externalApi.listByCell", () => {
  it("reuses another cell's result for the same source when asked, copying it under this cell's key", async () => {
    // Two sheets, two cells, one source URL nobody else in this suite uses.
    const url = `https://files.test/${crypto.randomUUID()}.mp3`;
    const first = await makeSheetWithAudioCell(url);
    const second = await makeSheetWithAudioCell(url);
    await externalApiService.save({
      cellId: first.cellId,
      input: url,
      output: transcript("from the first cell"),
    });
    let calls = 0;
    const produce = async () => {
      calls += 1;
      return transcript("fresh");
    };

    const shared = await externalApiService.resolve(
      { cellId: second.cellId, input: url },
      produce,
      () => true,
      { anyCell: true },
    );
    expect(shared.reused).toBe(true);
    expect(calls).toBe(0);
    // A copy of its own, not a pointer at the other cell's row.
    expect(shared.record.cellId).toBe(second.cellId);
    expect(shared.record.output).toMatchObject({ text: "from the first cell" });
    expect(
      await externalApiService.find({ cellId: second.cellId, input: url }),
    ).toMatchObject({ id: shared.record.id });
    // The newest row for that source is now the copy.
    expect(await externalApiService.findByInput(url)).toMatchObject({
      cellId: second.cellId,
    });
    // A refused kind elsewhere is not a hit either.
    const other = await makeSheetWithAudioCell(url);
    const refused = await externalApiService.resolve(
      { cellId: other.cellId, input: url },
      produce,
      () => false,
      { anyCell: true },
    );
    expect(refused.reused).toBe(false);
    expect(calls).toBe(1);
  });

  it("stays per cell unless asked", async () => {
    const url = `https://files.test/${crypto.randomUUID()}.mp3`;
    const first = await makeSheetWithAudioCell(url);
    const second = await makeSheetWithAudioCell(url);
    await externalApiService.save({
      cellId: first.cellId,
      input: url,
      output: transcript("elsewhere"),
    });
    let calls = 0;
    const own = await externalApiService.resolve(
      { cellId: second.cellId, input: url },
      async () => {
        calls += 1;
        return transcript("mine");
      },
    );
    expect(own.reused).toBe(false);
    expect(calls).toBe(1);
    expect(own.record.output).toMatchObject({ text: "mine" });
    expect(
      await externalApiService.findByInput("https://never.test/x"),
    ).toBeNull();
  });

  it("lists a cell's results newest first", async () => {
    const cell = await makeSheetWithAudioCell();
    const older = await externalApiService.save({
      cellId: cell.cellId,
      input: "https://files.test/older.mp3",
      output: transcript("older"),
    });
    // createdAt has millisecond resolution; keep the two rows apart.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await externalApiService.save({
      cellId: cell.cellId,
      input: "https://files.test/newer.mp3",
      output: transcript("newer"),
    });

    const list = await caller.externalApi.listByCell({ cellId: cell.cellId });
    expect(list.map((row) => row.id)).toEqual([newer.id, older.id]);
    expectDate(list[0]?.createdAt);
  });

  it("returns [] for a cell that has no results", async () => {
    const cell = await makeSheetWithAudioCell();
    expect(
      await caller.externalApi.listByCell({ cellId: cell.cellId }),
    ).toEqual([]);
  });

  it("rejects a blank cellId", async () => {
    await expectTRPCError(
      caller.externalApi.listByCell({ cellId: "  " }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("externalApi.byId", () => {
  it("reads one result back", async () => {
    const cell = await makeSheetWithAudioCell();
    const saved = await externalApiService.save({
      cellId: cell.cellId,
      input: cell.url,
      output: transcript("by id"),
    });
    const found = await caller.externalApi.byId({ id: saved.id });
    expect(found).toMatchObject({ id: saved.id, input: cell.url });
    expect(found.output).toMatchObject({ text: "by id" });
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    await expectTRPCError(
      caller.externalApi.byId({ id: "00000000-0000-0000-0000-000000000000" }),
      "NOT_FOUND",
    );
    await expectError(
      externalApiService.byId("00000000-0000-0000-0000-000000000000"),
      ExternalApiNotFoundError,
    );
  });
});

describe.skipIf(!dbUp)("cascade delete", () => {
  const countFor = (id: string) =>
    prisma.externalApi.count({ where: { cellId: id } });

  it("drops a cell's results when the cell is cleared", async () => {
    const cell = await makeSheetWithAudioCell();
    await externalApiService.save({
      cellId: cell.cellId,
      input: cell.url,
      output: transcript("cleared"),
    });
    expect(await countFor(cell.cellId)).toBe(1);

    // Clearing a cell deletes its Cell row (docs/features/spreadsheet.md).
    await caller.spreadsheet.setCell({
      id: cell.sheetId,
      rowIndex: 0,
      columnIndex: cell.columnIndex,
      value: null,
    });
    expect(await countFor(cell.cellId)).toBe(0);
  });

  it("drops them when the row, the column or the sheet goes", async () => {
    const row = await makeSheetWithAudioCell();
    await externalApiService.save({
      cellId: row.cellId,
      input: row.url,
      output: transcript("row"),
    });
    await caller.spreadsheet.removeRow({ id: row.sheetId, rowIndex: 0 });
    expect(await countFor(row.cellId)).toBe(0);

    const column = await makeSheetWithAudioCell();
    await externalApiService.save({
      cellId: column.cellId,
      input: column.url,
      output: transcript("column"),
    });
    await caller.spreadsheet.removeColumn({
      id: column.sheetId,
      columnIndex: column.columnIndex,
    });
    expect(await countFor(column.cellId)).toBe(0);

    const sheet = await makeSheetWithAudioCell();
    await externalApiService.save({
      cellId: sheet.cellId,
      input: sheet.url,
      output: transcript("sheet"),
    });
    await spreadsheetService.remove(sheet.sheetId);
    expect(await countFor(sheet.cellId)).toBe(0);
  });
});
