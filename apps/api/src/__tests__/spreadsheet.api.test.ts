/**
 * CONTRACT — spreadsheet
 * Feature doc: docs/features/spreadsheet.md · Rules: docs/rules/TESTING.md
 *
 * TABLES
 *   Spreadsheet  id (pk uuid), name, totalRows (default 5_000_000),
 *                createdAt (indexed), updatedAt
 *   Column       id (pk "<sheetId>.col.<index>"), spreadsheetId (fk cascade),
 *                index, name, type ColumnType, unique(spreadsheetId, index)
 *   Row          id (pk "<sheetId>.row.<index>"), spreadsheetId (fk cascade),
 *                index, unique(spreadsheetId, index) — sparse: a record exists
 *                only where something was written
 *   Cell         id (pk "<sheetId>.cell.<row>.<col>"), spreadsheetId (fk
 *                cascade), rowIndex, columnIndex, value Json?,
 *                unique(spreadsheetId, rowIndex, columnIndex)
 *
 * ColumnType (db): STRING NUMBER BOOLEAN DATE JSON FORMULA AUDIO FILE EMAIL URL
 * On the wire the type vocabulary is lowercase ("string", "audio", ...).
 *
 * MODELS (wire — ids are always the short form)
 *   SpreadsheetMeta = { id, name, totalRows, totalColumns, createdAt: Date,
 *                       updatedAt: Date }           (dates via superjson)
 *   SheetColumn  = { id: "col.<i>", index, name, type }
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
 * | spreadsheet.create       | mutation | { name: 1..200; totalRows?: 1..10_000_000 }     | SpreadsheetMeta   | BAD_REQUEST                   |
 * | spreadsheet.remove       | mutation | { id }                                          | { id }            | NOT_FOUND                     |
 * | spreadsheet.rows         | query    | { id; startRow?: >=0; limit?: 1..500 }          | SheetPayload      | NOT_FOUND, BAD_REQUEST        |
 * | spreadsheet.row          | query    | { id; rowIndex }                                | SheetRow          | NOT_FOUND (sheet)             |
 * | spreadsheet.column       | query    | { id; columnIndex }                             | SheetColumn       | NOT_FOUND                     |
 * | spreadsheet.cell         | query    | { id; rowIndex; columnIndex }                   | SheetCell         | NOT_FOUND (column)            |
 * | spreadsheet.setCell      | mutation | { id; rowIndex; columnIndex; value }            | SheetCell         | NOT_FOUND, BAD_REQUEST (type) |
 * | spreadsheet.updateRow    | mutation | { id; rowIndex; cells: {columnIndex; value}[] } | SheetRow          | NOT_FOUND, BAD_REQUEST (type) |
 * | spreadsheet.createRow    | mutation | { id; index?: >=0 } (default: max stored + 1)   | SheetRow          | NOT_FOUND, CONFLICT (exists)  |
 * | spreadsheet.removeRow    | mutation | { id; rowIndex }                                | { id: "row.N" }   | NOT_FOUND (sheet)             |
 * | spreadsheet.createColumn | mutation | { id; name; type? (default "string") }          | SheetColumn       | NOT_FOUND, BAD_REQUEST        |
 * | spreadsheet.updateColumn | mutation | { id; columnIndex; name?; type? }               | SheetColumn       | NOT_FOUND, BAD_REQUEST        |
 * | spreadsheet.removeColumn | mutation | { id; columnIndex }                             | { id: "col.N" }   | NOT_FOUND, CONFLICT (not last)|
 *
 * REST (same service, same shapes; errors as { statusCode, code, message })
 * | GET    /spreadsheets                               | 200 | list         |
 * | POST   /spreadsheets                               | 201 | create       |
 * | GET    /spreadsheets/:id                           | 200 | byId         |
 * | DELETE /spreadsheets/:id                           | 200 | remove       |
 * | GET    /spreadsheets/:id/rows?startRow&limit       | 200 | rows         |
 * | POST   /spreadsheets/:id/rows                      | 201 | createRow    |
 * | GET    /spreadsheets/:id/rows/:r                   | 200 | row          |
 * | PATCH  /spreadsheets/:id/rows/:r                   | 200 | updateRow    |
 * | DELETE /spreadsheets/:id/rows/:r                   | 200 | removeRow    |
 * | POST   /spreadsheets/:id/columns                   | 201 | createColumn |
 * | GET    /spreadsheets/:id/columns/:c                | 200 | column       |
 * | PATCH  /spreadsheets/:id/columns/:c                | 200 | updateColumn |
 * | DELETE /spreadsheets/:id/columns/:c                | 200 | removeColumn |
 * | GET    /spreadsheets/:id/cells/:r/:c               | 200 | cell         |
 * | PATCH  /spreadsheets/:id/cells/:r/:c  body {value} | 200 | setCell      |
 * Statuses: not_found 404 · bad_request/validation 400 · conflict 409.
 *
 * NOTES
 * - Rows are sparse; row indexes are absolute grid positions. removeRow clears
 *   the row and never shifts later rows; a never-written row/cell reads back
 *   blank (columns: [] / value: null), not 404.
 * - Columns are append-only (index = current count) and only the last column
 *   can be deleted (CONFLICT otherwise) — index-derived ids never renumber.
 * - setCell(value: null) deletes the cell record; `value` is never stored null.
 * - Cell values are validated against the column type: number→number,
 *   boolean→boolean, date→parseable ISO string, json→plain object,
 *   audio/file/url→http(s) URL string, email→email string,
 *   string/formula→string.
 * - updateColumn changing `type` does not convert or revalidate stored cells.
 * - FORMULA is storage-only; nothing evaluates formulas.
 * - `rows` pagination counts *stored* rows: take limit+1, hasMore when the
 *   extra record exists, nextCursor is its short row id.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createApp } from "../bootstrap";
import { pingDatabase } from "../db/prisma";
import { spreadsheetService } from "../modules/spreadsheet/spreadsheet.service";
import { caller, expectDate, expectTRPCError } from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

const createdIds: string[] = [];

/** Creates a spreadsheet and registers it for cleanup. */
async function makeSheet(name = "contract sheet") {
  const sheet = await caller.spreadsheet.create({ name });
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
      totalRows: 100,
    });
    createdIds.push(sheet.id);
    expect(sheet.totalRows).toBe(100);
  });

  it("rejects a blank name", async () => {
    await expectTRPCError(
      caller.spreadsheet.create({ name: "  " }),
      "BAD_REQUEST",
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
    });
    expect(second).toEqual({
      id: "col.1",
      index: 1,
      name: "Second",
      type: "number",
    });
    const meta = await caller.spreadsheet.byId({ id: sheet.id });
    expect(meta.totalColumns).toBe(2);
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
    });
    const cell = await caller.spreadsheet.cell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(cell.value).toBe("keep");
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

  it("returns CONFLICT for a non-last column", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.removeColumn({ id: sheet.id, columnIndex: 0 }),
      "CONFLICT",
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
      json("POST", { name: "rest sheet" }),
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

    // 409 non-last column delete
    const notLast = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/columns/0`,
      { method: "DELETE" },
    );
    expect(notLast.status).toBe(409);
    expect(await notLast.json()).toMatchObject({
      code: "SPREADSHEET_COLUMN_NOT_LAST",
    });
  });
});

describe.skipIf(dbUp)("spreadsheet contract (no database configured)", () => {
  it("is skipped without a reachable DATABASE_URL", () => {
    expect(dbUp).toBe(false);
  });
});
