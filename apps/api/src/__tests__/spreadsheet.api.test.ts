/**
 * CONTRACT — spreadsheet
 * Feature doc: docs/features/spreadsheet.md · Rules: docs/rules/TESTING.md
 *
 * TABLES
 *   Spreadsheet  id (pk uuid), name, totalRows (default 5_000_000),
 *                workspaceId (fk cascade → Workspace, indexed — see the
 *                workspace contract), createdAt (indexed), updatedAt
 *   Column       id (pk "<sheetId>.col.<index>"), spreadsheetId (fk cascade),
 *                index, name, type ColumnType, node NodeType? (null = plain
 *                column), prompt String?, unique(spreadsheetId, index)
 *   Row          id (pk "<sheetId>.row.<index>"), spreadsheetId (fk cascade),
 *                index, unique(spreadsheetId, index) — sparse: a record exists
 *                only where something was written
 *   Cell         id (pk "<sheetId>.cell.<row>.<col>"), spreadsheetId (fk
 *                cascade), rowIndex, columnIndex, value Json?,
 *                unique(spreadsheetId, rowIndex, columnIndex)
 *
 * ColumnType (db): STRING NUMBER BOOLEAN DATE JSON FORMULA AUDIO FILE EMAIL URL
 * NodeType (db): AI EMAIL — a column's automated-processing kind; null = none.
 * On the wire both vocabularies are lowercase ("string", "audio", "ai", ...).
 *
 * MODELS (wire — ids are always the short form)
 *   SpreadsheetMeta = { id, name, totalRows, totalColumns, createdAt: Date,
 *                       updatedAt: Date }           (dates via superjson)
 *   SheetColumn  = { id: "col.<i>", index, name, type,
 *                    node: "ai" | "email" | null, prompt: string | null }
 *   SheetRow     = { id: "row.<i>", index,
 *                    columns: { id: "col.<i>", name, value }[] } — one entry
 *                    per stored cell, ordered by column index; blank cells are
 *                    absent entries, a blank row is columns: []
 *   SheetCell    = { id: "cell.<r>.<c>", rowIndex, columnIndex, value }
 *   CellValue    = string | number | boolean | object | null — null clears
 *   SheetPayload = { spreadsheet: { id, name, totalRows, totalColumns },
 *                    columns: SheetColumn[], rows: SheetRow[],
 *                    pagination: { startRow, limit, hasMore, nextCursor } }
 *
 * PROCEDURES
 * | Procedure                | Kind     | Payload                                         | Response          | Errors                        |
 * | ------------------------ | -------- | ----------------------------------------------- | ----------------- | ----------------------------- |
 * | spreadsheet.list         | query    | —                                               | SpreadsheetMeta[] | —                             |
 * | spreadsheet.byId         | query    | { id }                                          | SpreadsheetMeta   | NOT_FOUND                     |
 * | spreadsheet.create       | mutation | { name: 1..200; workspaceId; totalRows?: 1..10_000_000 } | SpreadsheetMeta | BAD_REQUEST, NOT_FOUND (workspace) |
 * | spreadsheet.remove       | mutation | { id }                                          | { id }            | NOT_FOUND                     |
 * | spreadsheet.rows         | query    | { id; startRow?: >=0; limit?: 1..500 }          | SheetPayload      | NOT_FOUND, BAD_REQUEST        |
 * | spreadsheet.row          | query    | { id; rowIndex }                                | SheetRow          | NOT_FOUND (sheet)             |
 * | spreadsheet.column       | query    | { id; columnIndex }                             | SheetColumn       | NOT_FOUND                     |
 * | spreadsheet.cell         | query    | { id; rowIndex; columnIndex }                   | SheetCell         | NOT_FOUND (column)            |
 * | spreadsheet.setCell      | mutation | { id; rowIndex; columnIndex; value }            | SheetCell         | NOT_FOUND, BAD_REQUEST (type) |
 * | spreadsheet.updateRow    | mutation | { id; rowIndex; cells: {columnIndex; value}[] } | SheetRow          | NOT_FOUND, BAD_REQUEST (type) |
 * | spreadsheet.createRow    | mutation | { id; index?: >=0 } (default: max stored + 1)   | SheetRow          | NOT_FOUND, CONFLICT (exists)  |
 * | spreadsheet.appendRow    | mutation | { id; cells: {columnIndex; value}[] (min 1) }   | SheetRow          | NOT_FOUND, BAD_REQUEST (type), CONFLICT (retries exhausted) |
 * | spreadsheet.removeRow    | mutation | { id; rowIndex }                                | { id: "row.N" }   | NOT_FOUND (sheet)             |
 * | spreadsheet.removeRows   | mutation | { id; rowIndexes: number[] (1..10_000) }        | { ids: string[] } | NOT_FOUND (sheet), BAD_REQUEST|
 * | spreadsheet.createColumn | mutation | { id; name; type? (default "string"); node?; prompt? } | SheetColumn | NOT_FOUND, BAD_REQUEST  |
 * | spreadsheet.updateColumn | mutation | { id; columnIndex; name?; type?; node?; prompt? } | SheetColumn     | NOT_FOUND, BAD_REQUEST        |
 * | spreadsheet.removeColumn | mutation | { id; columnIndex }                             | { id: "col.N" }   | NOT_FOUND                     |
 *
 * REST (same service, same shapes; errors as { statusCode, code, message })
 * | GET    /spreadsheets                               | 200 | list         |
 * | POST   /spreadsheets                               | 201 | create       |
 * | GET    /spreadsheets/:id                           | 200 | byId         |
 * | DELETE /spreadsheets/:id                           | 200 | remove       |
 * | GET    /spreadsheets/:id/rows?startRow&limit       | 200 | rows         |
 * | POST   /spreadsheets/:id/rows                      | 201 | createRow    |
 * | POST   /spreadsheets/:id/rows/append               | 201 | appendRow    |
 * | POST   /spreadsheets/:id/rows/remove               | 200 | removeRows   |
 * | GET    /spreadsheets/:id/rows/:r                   | 200 | row          |
 * | PATCH  /spreadsheets/:id/rows/:r                   | 200 | updateRow    |
 * | DELETE /spreadsheets/:id/rows/:r                   | 200 | removeRow    |
 * | POST   /spreadsheets/:id/columns                   | 201 | createColumn |
 * | GET    /spreadsheets/:id/columns/:c                | 200 | column       |
 * | PATCH  /spreadsheets/:id/columns/:c                | 200 | updateColumn |
 * | DELETE /spreadsheets/:id/columns/:c                | 200 | removeColumn |
 * | GET    /spreadsheets/:id/cells/:r/:c               | 200 | cell         |
 * | PATCH  /spreadsheets/:id/cells/:r/:c  body {value} | 200 | setCell      |
 * | POST   /spreadsheets/:id/import  multipart "file" | 200 | import       |
 * Statuses: not_found 404 · bad_request/validation 400 · conflict 409.
 *
 * IMPORT  POST /spreadsheets/:id/import — multipart, field "file", .csv or
 * .xlsx, <= 25 MB. REST only, no tRPC procedure: multipart does not belong on
 * the tRPC link, and a procedure would pull the parsers into src/trpc/**, the
 * graph the dashboard transpiles. Returns 200, not 201 — it creates no new
 * resource.
 *   SheetImportResult = { id; name; totalRows; totalColumns; rowCount;
 *                         cellCount; columns: SheetColumn[] }
 *
 * NOTES
 * - Rows are sparse; row indexes are absolute grid positions. removeRow clears
 *   the row and never shifts later rows; a never-written row/cell reads back
 *   blank (columns: [] / value: null), not 404.
 * - Columns are append-only: a new column lands one past the highest stored
 *   index. Any column can be deleted — its cells go with it and its index
 *   becomes a permanent gap that is never reused; index-derived ids never
 *   renumber. Deleting an index with no column is NOT_FOUND.
 * - setCell(value: null) deletes the cell record; `value` is never stored null.
 * - appendRow writes at one past the highest stored row index, row + cells in
 *   one transaction; the index race with concurrent appends is retried
 *   internally. `value: null` entries write no cell.
 * - removeRows is removeRow for a batch: one transaction, absolute positions,
 *   nothing shifts, indexes without a stored row are no-ops. Duplicates are
 *   collapsed; `ids` lists the distinct short row ids acted on. Returns 200
 *   over REST — a delete creates nothing.
 * - Cell values are validated against the column type: number→number,
 *   boolean→boolean, date→parseable ISO string, json→plain object,
 *   audio/file/url→http(s) URL string, email→email string,
 *   string/formula→string.
 * - updateColumn changing `type` does not convert or revalidate stored cells.
 * - `node`/`prompt` both default to null; a prompt without a node is
 *   BAD_REQUEST (create checks the payload, update checks the effective
 *   stored+incoming pair). On updateColumn, `undefined` leaves a field
 *   unchanged and `null` clears it; `node: null` also clears `prompt`.
 *   Imported columns never carry a node.
 * - FORMULA is storage-only; nothing evaluates formulas.
 * - `rows` pagination counts *stored* rows: take limit+1, hasMore when the
 *   extra record exists, nextCursor is its short row id.
 * - Every sheet belongs to a workspace (`workspaceId`, cascade on delete). The
 *   app creates sheets only through `workspace.create`, which names the sheet
 *   after the workspace; `spreadsheet.create` itself does not enforce
 *   one-sheet-per-workspace — the schema is one-to-many by design.
 * - Every procedure is public; there is no auth yet.
 *
 * IMPORT NOTES
 * - Import is a **full replace**: every Column, Row and Cell of the sheet is
 *   deleted and rebuilt from the file in one transaction, so a failure leaves
 *   the sheet exactly as it was and a re-import of the same file is a no-op.
 *   It is the only operation that rebuilds the grid wholesale.
 * - `totalRows` is the sheet's virtual grid height and is NOT changed by an
 *   import. `rowCount` is the data rows the file held (header excluded);
 *   `cellCount` the non-empty cells written.
 * - Row 0 of the file names the columns; a blank name becomes "Column <n>".
 * - A column's type is inferred only if EVERY non-empty value fits it, tried
 *   boolean → number → date → json → email → url → string. A `url` column whose
 *   values all end in an audio extension becomes `audio`; known file extensions
 *   make it `file`. `formula` is never inferred. Values are coerced to the
 *   inferred type before storage, so an imported value always satisfies the
 *   same check `setCell` would apply.
 * - Only `true`/`false`/`yes`/`no` infer boolean — never `1`/`0`, which would
 *   turn numeric flag columns into booleans irrecoverably.
 * - A value with a leading zero ("007") is not a number, and a bare number is
 *   not a date: a date must look like one (digits split by - or /, or a month
 *   name) before `Date.parse` is trusted.
 * - A blank cell writes NO Cell record; a blank row still writes a Row record.
 *   Interior blank rows are kept, trailing blank rows trimmed.
 * - XLSX reads the FIRST worksheet only; formula cells contribute their cached
 *   result. `.xls` (legacy BIFF) is rejected.
 * - Errors, all 400 except the last: SPREADSHEET_IMPORT_UNSUPPORTED_TYPE ·
 *   _EMPTY · _NO_HEADER · _UNREADABLE · _TOO_LARGE · a 400 with no `code` when
 *   the "file" field is missing · SPREADSHEET_NOT_FOUND (404). No import error
 *   is a 409 — import overwrites state, so nothing about it can conflict.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import ExcelJS from "exceljs";
import { createApp } from "../bootstrap";
import { pingDatabase } from "../db/prisma";
import { spreadsheetService } from "../modules/spreadsheet/spreadsheet.service";
import { makeWorkspace, removeWorkspace } from "./support/fixtures";
import { caller, expectDate, expectTRPCError } from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

const createdIds: string[] = [];

// Every sheet needs a workspace; one hosts them all for this file. Its own
// auto-created sheet goes with it in cleanup (fk cascade).
let workspaceId = "";
if (dbUp) {
  workspaceId = (await makeWorkspace("spreadsheet contract host")).id;
}

/** Creates a spreadsheet and registers it for cleanup. */
async function makeSheet(name = "contract sheet") {
  const sheet = await caller.spreadsheet.create({ name, workspaceId });
  createdIds.push(sheet.id);
  return sheet;
}

/** Sheet with columns [text: string, num: number, tune: audio]. */
async function makeTypedSheet() {
  const sheet = await makeSheet("typed sheet");
  await caller.spreadsheet.createColumn({ id: sheet.id, name: "text" });
  await caller.spreadsheet.createColumn({
    id: sheet.id,
    name: "num",
    type: "number",
  });
  await caller.spreadsheet.createColumn({
    id: sheet.id,
    name: "tune",
    type: "audio",
  });
  return sheet;
}

afterAll(async () => {
  for (const id of createdIds) {
    await spreadsheetService.remove(id).catch(() => {});
  }
  if (workspaceId) await removeWorkspace(workspaceId);
});

describe.skipIf(!dbUp)("spreadsheet.create", () => {
  it("creates from the minimal payload with the 5M-row default", async () => {
    const sheet = await makeSheet("minimal");
    expect(sheet).toMatchObject({
      name: "minimal",
      totalRows: 5_000_000,
      totalColumns: 0,
    });
    expectDate(sheet.createdAt);
    expectDate(sheet.updatedAt);
  });

  it("honours an explicit totalRows", async () => {
    const sheet = await caller.spreadsheet.create({
      name: "sized",
      workspaceId,
      totalRows: 100,
    });
    createdIds.push(sheet.id);
    expect(sheet.totalRows).toBe(100);
  });

  it("rejects a blank name", async () => {
    await expectTRPCError(
      caller.spreadsheet.create({ name: "  ", workspaceId }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for a missing workspace", async () => {
    await expectTRPCError(
      caller.spreadsheet.create({ name: "orphan", workspaceId: "no-such-ws" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.byId", () => {
  it("reads back a created sheet", async () => {
    const created = await makeSheet("readable");
    const sheet = await caller.spreadsheet.byId({ id: created.id });
    expect(sheet).toMatchObject({ id: created.id, name: "readable" });
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.spreadsheet.byId({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.list", () => {
  it("includes created sheets, newest first", async () => {
    const older = await makeSheet("older");
    const newer = await makeSheet("newer");
    const sheets = await caller.spreadsheet.list();
    const olderIndex = sheets.findIndex((s) => s.id === older.id);
    const newerIndex = sheets.findIndex((s) => s.id === newer.id);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });
});

describe.skipIf(!dbUp)("spreadsheet.remove", () => {
  it("removes the sheet and everything under it", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
      value: "x",
    });
    const removed = await caller.spreadsheet.remove({ id: sheet.id });
    expect(removed).toEqual({ id: sheet.id });
    createdIds.splice(createdIds.indexOf(sheet.id), 1);
    await expectTRPCError(
      caller.spreadsheet.byId({ id: sheet.id }),
      "NOT_FOUND",
    );
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.spreadsheet.remove({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.createColumn", () => {
  it("appends with deterministic short ids and a string default type", async () => {
    const sheet = await makeSheet("columns");
    const first = await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "First",
    });
    const second = await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Second",
      type: "number",
    });
    expect(first).toEqual({
      id: "col.0",
      index: 0,
      name: "First",
      type: "string",
      node: null,
      prompt: null,
    });
    expect(second).toEqual({
      id: "col.1",
      index: 1,
      name: "Second",
      type: "number",
      node: null,
      prompt: null,
    });
    const meta = await caller.spreadsheet.byId({ id: sheet.id });
    expect(meta.totalColumns).toBe(2);
  });

  it("stores a node and its prompt", async () => {
    const sheet = await makeSheet("node columns");
    const column = await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Summary",
      node: "ai",
      prompt: "Summarise the row",
    });
    expect(column).toMatchObject({ node: "ai", prompt: "Summarise the row" });
    const read = await caller.spreadsheet.column({
      id: sheet.id,
      columnIndex: 0,
    });
    expect(read).toMatchObject({ node: "ai", prompt: "Summarise the row" });
  });

  it("rejects a prompt without a node and an unknown node", async () => {
    const sheet = await makeSheet("bad node columns");
    await expectTRPCError(
      caller.spreadsheet.createColumn({
        id: sheet.id,
        name: "x",
        prompt: "orphan",
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.spreadsheet.createColumn({
        id: sheet.id,
        name: "x",
        node: "robot" as never,
      }),
      "BAD_REQUEST",
    );
  });

  it("rejects a blank name and an unknown type", async () => {
    const sheet = await makeSheet("bad columns");
    await expectTRPCError(
      caller.spreadsheet.createColumn({ id: sheet.id, name: " " }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.spreadsheet.createColumn({
        id: sheet.id,
        name: "x",
        type: "vector" as never,
      }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for a missing sheet", async () => {
    await expectTRPCError(
      caller.spreadsheet.createColumn({ id: "does-not-exist", name: "x" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.column", () => {
  it("reads a column back", async () => {
    const sheet = await makeTypedSheet();
    const column = await caller.spreadsheet.column({
      id: sheet.id,
      columnIndex: 2,
    });
    expect(column).toEqual({
      id: "col.2",
      index: 2,
      name: "tune",
      type: "audio",
      node: null,
      prompt: null,
    });
  });

  it("returns NOT_FOUND for a missing column and a missing sheet", async () => {
    const sheet = await makeSheet("no columns");
    await expectTRPCError(
      caller.spreadsheet.column({ id: sheet.id, columnIndex: 0 }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      caller.spreadsheet.column({ id: "does-not-exist", columnIndex: 0 }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.updateColumn", () => {
  it("renames and retypes without touching stored cells", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
      value: "keep",
    });
    const updated = await caller.spreadsheet.updateColumn({
      id: sheet.id,
      columnIndex: 0,
      name: "renamed",
      type: "number",
    });
    expect(updated).toEqual({
      id: "col.0",
      index: 0,
      name: "renamed",
      type: "number",
      node: null,
      prompt: null,
    });
    const cell = await caller.spreadsheet.cell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(cell.value).toBe("keep");
  });

  it("keeps node and prompt through a name-only update", async () => {
    const sheet = await makeSheet("node kept");
    await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Summary",
      node: "ai",
      prompt: "Summarise the row",
    });
    const updated = await caller.spreadsheet.updateColumn({
      id: sheet.id,
      columnIndex: 0,
      name: "renamed",
    });
    expect(updated).toMatchObject({
      name: "renamed",
      node: "ai",
      prompt: "Summarise the row",
    });
  });

  it("clearing the node also clears the prompt", async () => {
    const sheet = await makeSheet("node cleared");
    await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Summary",
      node: "email",
      prompt: "Draft a reply",
    });
    const updated = await caller.spreadsheet.updateColumn({
      id: sheet.id,
      columnIndex: 0,
      node: null,
    });
    expect(updated).toMatchObject({ node: null, prompt: null });
  });

  it("rejects a prompt when the effective node is null", async () => {
    const sheet = await makeSheet("orphan prompt");
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "plain" });
    await expectTRPCError(
      caller.spreadsheet.updateColumn({
        id: sheet.id,
        columnIndex: 0,
        prompt: "orphan",
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.spreadsheet.updateColumn({
        id: sheet.id,
        columnIndex: 0,
        node: null,
        prompt: "orphan",
      }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for a missing column", async () => {
    const sheet = await makeSheet("update missing column");
    await expectTRPCError(
      caller.spreadsheet.updateColumn({
        id: sheet.id,
        columnIndex: 5,
        name: "x",
      }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.removeColumn", () => {
  it("removes the last column and its cells", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 2,
      value: "https://example.com/a.mp3",
    });
    const removed = await caller.spreadsheet.removeColumn({
      id: sheet.id,
      columnIndex: 2,
    });
    expect(removed).toEqual({ id: "col.2" });
    const meta = await caller.spreadsheet.byId({ id: sheet.id });
    expect(meta.totalColumns).toBe(2);
    await expectTRPCError(
      caller.spreadsheet.cell({ id: sheet.id, rowIndex: 0, columnIndex: 2 }),
      "NOT_FOUND",
    );
  });

  it("removes an interior column, leaving a permanent gap", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
      value: "keep left",
    });
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 1,
      value: 7,
    });
    const removed = await caller.spreadsheet.removeColumn({
      id: sheet.id,
      columnIndex: 1,
    });
    expect(removed).toEqual({ id: "col.1" });

    // Neighbors keep their indexes and values; the deleted column is gone.
    const meta = await caller.spreadsheet.byId({ id: sheet.id });
    expect(meta.totalColumns).toBe(2);
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.columns.map((c) => c.id)).toEqual(["col.0", "col.2"]);
    const left = await caller.spreadsheet.cell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(left.value).toBe("keep left");
    await expectTRPCError(
      caller.spreadsheet.cell({ id: sheet.id, rowIndex: 0, columnIndex: 1 }),
      "NOT_FOUND",
    );

    // The gap is never refilled: the next column appends past the max index.
    const created = await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "fresh",
    });
    expect(created.id).toBe("col.3");
    expect(created.index).toBe(3);

    // Deleting the same index again is NOT_FOUND, matching updateColumn.
    await expectTRPCError(
      caller.spreadsheet.removeColumn({ id: sheet.id, columnIndex: 1 }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.setCell", () => {
  it("writes into a never-written row and reads back", async () => {
    const sheet = await makeTypedSheet();
    const cell = await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 7,
      columnIndex: 1,
      value: 42,
    });
    expect(cell).toEqual({
      id: "cell.7.1",
      rowIndex: 7,
      columnIndex: 1,
      value: 42,
    });
    const read = await caller.spreadsheet.cell({
      id: sheet.id,
      rowIndex: 7,
      columnIndex: 1,
    });
    expect(read.value).toBe(42);
  });

  it("overwrites, and null clears the cell", async () => {
    const sheet = await makeTypedSheet();
    const at = { id: sheet.id, rowIndex: 0, columnIndex: 0 };
    await caller.spreadsheet.setCell({ ...at, value: "a" });
    await caller.spreadsheet.setCell({ ...at, value: "b" });
    expect((await caller.spreadsheet.cell(at)).value).toBe("b");
    await caller.spreadsheet.setCell({ ...at, value: null });
    expect((await caller.spreadsheet.cell(at)).value).toBeNull();
  });

  it("rejects a value that does not fit the column type", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex: 0,
        columnIndex: 1,
        value: "hello",
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex: 0,
        columnIndex: 2,
        value: "not a url",
      }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for a missing column", async () => {
    const sheet = await makeSheet("cells without columns");
    await expectTRPCError(
      caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex: 0,
        columnIndex: 0,
        value: "x",
      }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.cell", () => {
  it("reads a never-written cell as value: null", async () => {
    const sheet = await makeTypedSheet();
    const cell = await caller.spreadsheet.cell({
      id: sheet.id,
      rowIndex: 99,
      columnIndex: 0,
    });
    expect(cell).toEqual({
      id: "cell.99.0",
      rowIndex: 99,
      columnIndex: 0,
      value: null,
    });
  });
});

describe.skipIf(!dbUp)("spreadsheet.row", () => {
  it("returns the nested shape ordered by column index", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 3,
      columnIndex: 1,
      value: 5,
    });
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 3,
      columnIndex: 0,
      value: "hi",
    });
    const row = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 3 });
    expect(row).toEqual({
      id: "row.3",
      index: 3,
      columns: [
        { id: "col.0", name: "text", value: "hi" },
        { id: "col.1", name: "num", value: 5 },
      ],
    });
  });

  it("reads a never-written row as columns: []", async () => {
    const sheet = await makeTypedSheet();
    const row = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 12 });
    expect(row).toEqual({ id: "row.12", index: 12, columns: [] });
  });
});

describe.skipIf(!dbUp)("spreadsheet.rows", () => {
  it("returns the SheetPayload envelope with nested rows", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
      value: "a",
    });
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.spreadsheet).toEqual({
      id: sheet.id,
      name: "typed sheet",
      totalRows: 5_000_000,
      totalColumns: 3,
    });
    expect(payload.columns.map((c) => c.id)).toEqual([
      "col.0",
      "col.1",
      "col.2",
    ]);
    expect(payload.rows).toEqual([
      {
        id: "row.0",
        index: 0,
        columns: [{ id: "col.0", name: "text", value: "a" }],
      },
    ]);
    expect(payload.pagination).toEqual({
      startRow: 0,
      limit: 100,
      hasMore: false,
      nextCursor: null,
    });
  });

  it("pages stored rows with hasMore and nextCursor", async () => {
    const sheet = await makeTypedSheet();
    for (const rowIndex of [0, 1, 2]) {
      await caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex,
        columnIndex: 0,
        value: "x",
      });
    }
    const page = await caller.spreadsheet.rows({
      id: sheet.id,
      startRow: 1,
      limit: 1,
    });
    expect(page.rows.map((r) => r.index)).toEqual([1]);
    expect(page.pagination).toEqual({
      startRow: 1,
      limit: 1,
      hasMore: true,
      nextCursor: "row.2",
    });
  });

  it("rejects a bad limit and a missing sheet", async () => {
    const sheet = await makeSheet("rows guards");
    await expectTRPCError(
      caller.spreadsheet.rows({ id: sheet.id, limit: 0 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.spreadsheet.rows({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.updateRow", () => {
  it("writes a batch and returns the nested row", async () => {
    const sheet = await makeTypedSheet();
    const row = await caller.spreadsheet.updateRow({
      id: sheet.id,
      rowIndex: 2,
      cells: [
        { columnIndex: 0, value: "hello" },
        { columnIndex: 1, value: 3 },
      ],
    });
    expect(row.columns).toEqual([
      { id: "col.0", name: "text", value: "hello" },
      { id: "col.1", name: "num", value: 3 },
    ]);
  });

  it("rejects the whole batch when one value mismatches", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.updateRow({
        id: sheet.id,
        rowIndex: 0,
        cells: [
          { columnIndex: 0, value: "fine" },
          { columnIndex: 1, value: "not a number" },
        ],
      }),
      "BAD_REQUEST",
    );
    const row = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 0 });
    expect(row.columns).toEqual([]); // nothing was written
  });

  it("returns NOT_FOUND for an unknown column index", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.updateRow({
        id: sheet.id,
        rowIndex: 0,
        cells: [{ columnIndex: 9, value: "x" }],
      }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.createRow", () => {
  it("defaults to one past the highest stored row", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 4,
      columnIndex: 0,
      value: "x",
    });
    const row = await caller.spreadsheet.createRow({ id: sheet.id });
    expect(row).toEqual({ id: "row.5", index: 5, columns: [] });
  });

  it("returns CONFLICT for an already-stored index", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.createRow({ id: sheet.id, index: 3 });
    await expectTRPCError(
      caller.spreadsheet.createRow({ id: sheet.id, index: 3 }),
      "CONFLICT",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.appendRow", () => {
  it("appends at index 0 on a sheet with no stored rows", async () => {
    const sheet = await makeTypedSheet();
    const row = await caller.spreadsheet.appendRow({
      id: sheet.id,
      cells: [
        { columnIndex: 1, value: 7 },
        { columnIndex: 0, value: "first" },
      ],
    });
    expect(row).toEqual({
      id: "row.0",
      index: 0,
      columns: [
        { id: "col.0", name: "text", value: "first" },
        { id: "col.1", name: "num", value: 7 },
      ],
    });
  });

  it("appends past the highest stored row, not the row count", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 4,
      columnIndex: 0,
      value: "sparse",
    });
    const row = await caller.spreadsheet.appendRow({
      id: sheet.id,
      cells: [{ columnIndex: 0, value: "next" }],
    });
    expect(row.index).toBe(5);
  });

  it("writes no cell for a null entry", async () => {
    const sheet = await makeTypedSheet();
    const row = await caller.spreadsheet.appendRow({
      id: sheet.id,
      cells: [
        { columnIndex: 0, value: "kept" },
        { columnIndex: 1, value: null },
      ],
    });
    expect(row.columns).toEqual([{ id: "col.0", name: "text", value: "kept" }]);
  });

  it("rejects the whole batch on a type mismatch, creating no row", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.appendRow({
        id: sheet.id,
        cells: [
          { columnIndex: 0, value: "fine" },
          { columnIndex: 1, value: "not a number" },
        ],
      }),
      "BAD_REQUEST",
    );
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.rows).toEqual([]); // nothing was written
  });

  it("returns NOT_FOUND for an unknown column and an unknown sheet", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.appendRow({
        id: sheet.id,
        cells: [{ columnIndex: 9, value: "x" }],
      }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      caller.spreadsheet.appendRow({
        id: "does-not-exist",
        cells: [{ columnIndex: 0, value: "x" }],
      }),
      "NOT_FOUND",
    );
  });

  it("rejects an empty cells array", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.appendRow({ id: sheet.id, cells: [] }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("spreadsheet.removeRow", () => {
  it("clears the row without shifting later rows", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
      value: "gone",
    });
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 1,
      columnIndex: 0,
      value: "kept",
    });
    const removed = await caller.spreadsheet.removeRow({
      id: sheet.id,
      rowIndex: 0,
    });
    expect(removed).toEqual({ id: "row.0" });
    const cleared = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 0 });
    expect(cleared.columns).toEqual([]);
    const kept = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 1 });
    expect(kept.columns).toEqual([
      { id: "col.0", name: "text", value: "kept" },
    ]);
  });
});

describe.skipIf(!dbUp)("spreadsheet.removeRows", () => {
  it("clears the listed rows and leaves the rest alone", async () => {
    const sheet = await makeTypedSheet();
    for (const rowIndex of [0, 1, 2]) {
      await caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex,
        columnIndex: 0,
        value: `row ${rowIndex}`,
      });
    }
    const removed = await caller.spreadsheet.removeRows({
      id: sheet.id,
      rowIndexes: [0, 2],
    });
    expect(removed).toEqual({ ids: ["row.0", "row.2"] });
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.rows).toEqual([
      {
        id: "row.1",
        index: 1,
        columns: [{ id: "col.0", name: "text", value: "row 1" }],
      },
    ]);
  });

  it("collapses duplicates and no-ops on never-stored indexes", async () => {
    const sheet = await makeTypedSheet();
    const removed = await caller.spreadsheet.removeRows({
      id: sheet.id,
      rowIndexes: [7, 7, 9],
    });
    expect(removed).toEqual({ ids: ["row.7", "row.9"] });
  });

  it("rejects an empty list and a missing sheet", async () => {
    const sheet = await makeSheet("remove rows guards");
    await expectTRPCError(
      caller.spreadsheet.removeRows({ id: sheet.id, rowIndexes: [] }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.spreadsheet.removeRows({ id: "does-not-exist", rowIndexes: [0] }),
      "NOT_FOUND",
    );
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

  const json = (method: string, body?: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  it("drives the full route surface", async () => {
    // POST /spreadsheets
    const createRes = await fetch(
      `${baseUrl}/spreadsheets`,
      json("POST", { name: "rest sheet", workspaceId }),
    );
    expect(createRes.status).toBe(201);
    const sheet = (await createRes.json()) as { id: string };
    createdIds.push(sheet.id);

    // GET /spreadsheets + /spreadsheets/:id
    expect((await fetch(`${baseUrl}/spreadsheets`)).status).toBe(200);
    const byId = await fetch(`${baseUrl}/spreadsheets/${sheet.id}`);
    expect(byId.status).toBe(200);
    expect(await byId.json()).toMatchObject({
      id: sheet.id,
      name: "rest sheet",
    });

    // POST /spreadsheets/:id/columns — append-only ids
    const colRes = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/columns`,
      json("POST", { name: "Age", type: "number" }),
    );
    expect(colRes.status).toBe(201);
    expect(await colRes.json()).toEqual({
      id: "col.0",
      index: 0,
      name: "Age",
      type: "number",
      node: null,
      prompt: null,
    });

    // PATCH + GET a cell
    const patchCell = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/cells/0/0`,
      json("PATCH", { value: 26 }),
    );
    expect(patchCell.status).toBe(200);
    expect(await patchCell.json()).toEqual({
      id: "cell.0.0",
      rowIndex: 0,
      columnIndex: 0,
      value: 26,
    });
    const getCell = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/cells/0/0`,
    );
    expect((await getCell.json()) as object).toMatchObject({ value: 26 });

    // GET /rows/:r, the /rows envelope, and /columns/:c
    const row = await fetch(`${baseUrl}/spreadsheets/${sheet.id}/rows/0`);
    expect(await row.json()).toEqual({
      id: "row.0",
      index: 0,
      columns: [{ id: "col.0", name: "Age", value: 26 }],
    });
    const rows = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows?startRow=0&limit=10`,
    );
    expect((await rows.json()) as object).toMatchObject({
      pagination: { startRow: 0, limit: 10, hasMore: false, nextCursor: null },
    });
    const column = await fetch(`${baseUrl}/spreadsheets/${sheet.id}/columns/0`);
    expect(await column.json()).toEqual({
      id: "col.0",
      index: 0,
      name: "Age",
      type: "number",
      node: null,
      prompt: null,
    });

    // PATCH /rows/:r + PATCH /columns/:c
    const patchRow = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows/1`,
      json("PATCH", { cells: [{ columnIndex: 0, value: 30 }] }),
    );
    expect(patchRow.status).toBe(200);
    const patchColumn = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/columns/0`,
      json("PATCH", { name: "Years" }),
    );
    expect(await patchColumn.json()).toMatchObject({ name: "Years" });

    // POST /rows, DELETE /rows/:r, DELETE /columns/:c, DELETE /spreadsheets/:id
    const postRow = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows`,
      json("POST", {}),
    );
    expect(postRow.status).toBe(201);

    // POST /rows/append — the row lands past the highest stored index
    const appendRes = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows/append`,
      json("POST", { cells: [{ columnIndex: 0, value: 31 }] }),
    );
    expect(appendRes.status).toBe(201);
    const appended = (await appendRes.json()) as { index: number };
    expect(appended).toMatchObject({
      columns: [{ id: "col.0", value: 31 }],
    });

    // POST /rows/remove — 200, batch delete of the row just appended
    const removeRes = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows/remove`,
      json("POST", { rowIndexes: [appended.index] }),
    );
    expect(removeRes.status).toBe(200);
    expect(await removeRes.json()).toEqual({
      ids: [`row.${appended.index}`],
    });

    const delRow = await fetch(`${baseUrl}/spreadsheets/${sheet.id}/rows/0`, {
      method: "DELETE",
    });
    expect(delRow.status).toBe(200);
    const delColumn = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/columns/0`,
      { method: "DELETE" },
    );
    expect(delColumn.status).toBe(200);
    const del = await fetch(`${baseUrl}/spreadsheets/${sheet.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    createdIds.splice(createdIds.indexOf(sheet.id), 1);
  });

  it("maps each error class to its status", async () => {
    // 404 domain not_found with the error body shape
    const missing = await fetch(`${baseUrl}/spreadsheets/does-not-exist`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      statusCode: 404,
      code: "SPREADSHEET_NOT_FOUND",
    });

    const sheet = await makeSheet("rest errors");
    await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "n",
      type: "number",
    });
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "s" });

    // 400 type mismatch
    const mismatch = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/cells/0/0`,
      json("PATCH", { value: "hello" }),
    );
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({
      code: "SPREADSHEET_CELL_TYPE_MISMATCH",
    });

    // 400 zod validation on a query param
    const badLimit = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows?limit=0`,
    );
    expect(badLimit.status).toBe(400);
    expect(await badLimit.json()).toMatchObject({ code: "VALIDATION_FAILED" });

    // 409 creating a row at an already-stored index
    await caller.spreadsheet.createRow({ id: sheet.id, index: 0 });
    const exists = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows`,
      json("POST", { index: 0 }),
    );
    expect(exists.status).toBe(409);
    expect(await exists.json()).toMatchObject({
      code: "SPREADSHEET_ROW_EXISTS",
    });
  });

  /* ------------------------------------------------------------- import */

  // Fixtures are built in memory — no fixture file is added to the repo. The
  // XLSX one is written with the same library the service reads with, so it is
  // a real workbook rather than a hand-rolled zip.
  const csvBody = (csv: string, name = "import.csv") => {
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), name);
    return form;
  };

  async function xlsxBody(rows: unknown[][], name = "import.xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    for (const row of rows) sheet.addRow(row);
    const bytes = new Uint8Array(
      (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
    );
    const form = new FormData();
    const type =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    form.append("file", new Blob([bytes], { type }), name);
    return form;
  }

  const importInto = (id: string, body: FormData) =>
    fetch(`${baseUrl}/spreadsheets/${id}/import`, { method: "POST", body });

  async function importCsv(csv: string, name?: string) {
    const sheet = await makeSheet("import target");
    const res = await importInto(sheet.id, csvBody(csv, name));
    return { sheet, res };
  }

  const EVERY_TYPE_CSV = [
    "Name,Email,Age,Joined,Active,Meta,Doc,Clip,Site,Zip",
    'Muhammad,m@example.com,26,2026-08-27T10:00:00.000Z,true,"{""a"":1}",https://e.com/a.pdf,https://e.com/a.mp3,https://e.com,007',
    'Ali,a@example.com,29,2026-08-20T12:00:00.000Z,false,"{""a"":2}",https://e.com/b.pdf,https://e.com/b.mp3,https://e.org,042',
  ].join("\n");

  it("infers a type per column and coerces the values", async () => {
    const { sheet, res } = await importCsv(EVERY_TYPE_CSV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalRows: number;
      totalColumns: number;
      rowCount: number;
      cellCount: number;
      columns: {
        id: string;
        index: number;
        name: string;
        type: string;
        node: string | null;
        prompt: string | null;
      }[];
    };
    expect(body.columns.map((column) => column.type)).toEqual([
      "string",
      "email",
      "number",
      "date",
      "boolean",
      "json",
      "file", // .pdf
      "audio", // .mp3
      "url", // no extension
      "string", // "007" keeps its leading zero
    ]);
    expect(body.columns[0]).toEqual({
      id: "col.0",
      index: 0,
      name: "Name",
      type: "string",
      node: null,
      prompt: null,
    });
    expect(body).toMatchObject({ rowCount: 2, cellCount: 20 });
    // The virtual grid height is not a row count and import does not touch it.
    expect(body.totalRows).toBe(5_000_000);

    const row = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 0 });
    const value = (columnId: string) =>
      row.columns.find((entry) => entry.id === columnId)?.value;
    expect(value("col.2")).toBe(26);
    expect(value("col.4")).toBe(true);
    expect(value("col.5")).toEqual({ a: 1 });
    expect(value("col.3")).toBe("2026-08-27T10:00:00.000Z");
    expect(value("col.9")).toBe("007");
  });

  it("replaces the whole grid, dropping columns the file does not have", async () => {
    const sheet = await makeSheet("import replaces");
    for (const name of ["one", "two", "three"]) {
      await caller.spreadsheet.createColumn({ id: sheet.id, name });
    }
    for (const rowIndex of [0, 1, 2]) {
      await caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex,
        columnIndex: 2,
        value: "old",
      });
    }

    const res = await importInto(sheet.id, csvBody("A,B\nx,y\n"));
    expect(res.status).toBe(200);

    // col.2 is gone even though it was not the last column when the import
    // started — the only operation allowed to do that.
    const meta = await caller.spreadsheet.byId({ id: sheet.id });
    expect(meta.totalColumns).toBe(2);
    await expectTRPCError(
      caller.spreadsheet.column({ id: sheet.id, columnIndex: 2 }),
      "NOT_FOUND",
    );
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0]?.columns).toEqual([
      { id: "col.0", name: "A", value: "x" },
      { id: "col.1", name: "B", value: "y" },
    ]);
  });

  it("is idempotent — the same file twice gives the same result", async () => {
    const sheet = await makeSheet("import twice");
    const first = await importInto(sheet.id, csvBody(EVERY_TYPE_CSV));
    const second = await importInto(sheet.id, csvBody(EVERY_TYPE_CSV));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
  });

  it("writes no cell record for a blank cell", async () => {
    const { sheet, res } = await importCsv("A,B,C\nx,,z\n");
    expect(res.status).toBe(200);
    expect((await res.json()) as { cellCount: number }).toMatchObject({
      cellCount: 2,
    });
    const row = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 0 });
    // The blank is an absent entry, not `value: null`.
    expect(row.columns.map((entry) => entry.id)).toEqual(["col.0", "col.2"]);
  });

  it("demotes a column to string when one value does not fit", async () => {
    const { sheet, res } = await importCsv("N\n1\n2\nabc\n");
    expect(res.status).toBe(200);
    const column = await caller.spreadsheet.column({
      id: sheet.id,
      columnIndex: 0,
    });
    expect(column.type).toBe("string");
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.rows.map((row) => row.columns[0]?.value)).toEqual([
      "1",
      "2",
      "abc",
    ]);
  });

  it("types an all-blank column as string and keeps interior blank rows", async () => {
    const { sheet, res } = await importCsv("A,Empty\nx,\n,\ny,\n");
    expect(res.status).toBe(200);
    const column = await caller.spreadsheet.column({
      id: sheet.id,
      columnIndex: 1,
    });
    expect(column.type).toBe("string");
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    // Three rows: the blank middle one still exists.
    expect(payload.rows.map((row) => row.index)).toEqual([0, 1, 2]);
    expect(payload.rows[1]?.columns).toEqual([]);
  });

  it("never infers boolean from 1/0", async () => {
    const { sheet, res } = await importCsv("Flag\n1\n0\n");
    expect(res.status).toBe(200);
    const column = await caller.spreadsheet.column({
      id: sheet.id,
      columnIndex: 0,
    });
    expect(column.type).toBe("number");
  });

  it("accepts a header-only file", async () => {
    const { res } = await importCsv("A,B\n");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      totalColumns: 2,
      rowCount: 0,
      cellCount: 0,
    });
  });

  it("reads an xlsx workbook, including real date and number cells", async () => {
    const sheet = await makeSheet("import xlsx");
    const res = await importInto(
      sheet.id,
      await xlsxBody([
        ["Name", "Age", "Joined", "Ok"],
        ["Muhammad", 26, new Date("2026-08-27T10:00:00.000Z"), true],
      ]),
    );
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { columns: { type: string }[] }).columns.map(
        (column) => column.type,
      ),
    ).toEqual(["string", "number", "date", "boolean"]);
    const row = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 0 });
    expect(row.columns.map((entry) => entry.value)).toEqual([
      "Muhammad",
      26,
      "2026-08-27T10:00:00.000Z",
      true,
    ]);
  });

  it("maps every import failure to its status and code", async () => {
    const sheet = await makeSheet("import failures");

    const cases: [FormData, string][] = [
      [csvBody("x", "notes.txt"), "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE"],
      [csvBody("legacy", "book.xls"), "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE"],
      [csvBody(""), "SPREADSHEET_IMPORT_EMPTY"],
      [csvBody(",,\na,b,c\n"), "SPREADSHEET_IMPORT_NO_HEADER"],
      [
        csvBody(Array.from({ length: 300 }, (_, i) => `c${i}`).join(",")),
        "SPREADSHEET_IMPORT_TOO_LARGE",
      ],
    ];
    for (const [body, code] of cases) {
      const res = await importInto(sheet.id, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ statusCode: 400, code });
    }

    // A missing "file" field is Nest's own BadRequestException — 400, no code.
    const noField = await importInto(sheet.id, new FormData());
    expect(noField.status).toBe(400);

    const missing = await importInto("does-not-exist", csvBody("A\nx\n"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      code: "SPREADSHEET_NOT_FOUND",
    });
  });
});

describe.skipIf(dbUp)("spreadsheet contract (no database configured)", () => {
  it("is skipped without a reachable DATABASE_URL", () => {
    expect(dbUp).toBe(false);
  });
});
