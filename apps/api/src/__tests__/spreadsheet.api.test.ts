/**
 * CONTRACT — spreadsheet
 * Feature doc: docs/features/spreadsheet.md · Rules: docs/rules/TESTING.md
 *
 * TABLES
 *   Spreadsheet  id (pk uuid), name, totalRows (default 5_000_000),
 *                workspaceId (fk cascade → Workspace, indexed — see the
 *                workspace contract), createdAt (indexed), updatedAt
 *   Column       id (pk "<sheetId>.col.<index>"), spreadsheetId (fk cascade),
 *                index (identity: the pk suffix and Cell.columnIndex — never
 *                changes), sortOrder (display position, dense 0..n-1 per
 *                sheet), name, type ColumnType, node NodeType? (null = plain
 *                column), prompt String?, unique(spreadsheetId, index),
 *                index(spreadsheetId, sortOrder) — deliberately not unique,
 *                a reorder shifts a band in one statement
 *   Row          id (pk "<sheetId>.row.<index>"), spreadsheetId (fk cascade),
 *                index, unique(spreadsheetId, index) — sparse: a record exists
 *                only where something was written
 *   Cell         id (pk "<sheetId>.cell.<row>.<col>"), spreadsheetId (fk
 *                cascade), rowIndex, columnIndex, value Json?,
 *                unique(spreadsheetId, rowIndex, columnIndex)
 *
 * ColumnType (db): STRING NUMBER BOOLEAN DATE JSON FORMULA AUDIO FILE EMAIL URL
 * NodeType (db): AI EMAIL GOOGLE_SEARCH — a column's automated-processing kind; null = none.
 *   EMAIL is the Mail node: it sends real email when run (run-ai contract).
 * On the wire both vocabularies are lowercase ("string", "audio", "ai", ...).
 *
 * MODELS (wire — ids are always the short form)
 *   SpreadsheetMeta = { id, name, description: string | null,
 *                       purpose: string | null,     // set by onboarding, else null
 *                       formOutputEnabled: boolean, // populate.setOutput, false by default
 *                       totalRows, totalColumns, createdAt: Date,
 *                       updatedAt: Date }           (dates via superjson)
 *   SheetColumn  = { id: "col.<i>", index, sortOrder, name, type,
 *                    node: "ai" | "email" | "google_search" | null,
 *                    prompt: string | null }
 *   SheetRow     = { id: "row.<i>", index,
 *                    columns: { id: "col.<i>", name, value }[] } — one entry
 *                    per stored cell, in the sheet's column order (sortOrder,
 *                    not index); blank cells are absent entries, a blank row
 *                    is columns: []
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
 * | spreadsheet.setCell      | mutation | { id; rowIndex; columnIndex; value }            | SheetCell         | NOT_FOUND, BAD_REQUEST (type, read-only Mail column) |
 * | spreadsheet.updateRow    | mutation | { id; rowIndex; cells: {columnIndex; value}[] } | SheetRow          | NOT_FOUND, BAD_REQUEST (type, read-only Mail column) |
 * | spreadsheet.createRow    | mutation | { id; index?: >=0 } (default: max stored + 1)   | SheetRow          | NOT_FOUND, CONFLICT (exists)  |
 * | spreadsheet.appendRow    | mutation | { id; cells: {columnIndex; value}[] (min 1) }   | SheetRow          | NOT_FOUND, BAD_REQUEST (type, read-only Mail column), CONFLICT (retries exhausted) |
 * | spreadsheet.removeRow    | mutation | { id; rowIndex }                                | { id: "row.N" }   | NOT_FOUND (sheet)             |
 * | spreadsheet.removeRows   | mutation | { id; rowIndexes: number[] (1..10_000) }        | { ids: string[] } | NOT_FOUND (sheet), BAD_REQUEST|
 * | spreadsheet.createColumn | mutation | { id; name; type? (default "string"); node?; prompt? } | SheetColumn | NOT_FOUND, BAD_REQUEST (incl. non-json Mail column), CONFLICT (name taken) |
 * | spreadsheet.updateColumn | mutation | { id; columnIndex; name?; type?; node?; prompt? } | SheetColumn     | NOT_FOUND, BAD_REQUEST (incl. non-json Mail column), CONFLICT (name taken) |
 * | spreadsheet.reorderColumn| mutation | { id; columnIndex; newSortOrder: 0..n-1 }       | SheetColumn[] (the whole order) | NOT_FOUND, BAD_REQUEST |
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
 * | POST   /spreadsheets/:id/columns/:c/reorder  body {newSortOrder} | 200 | reorderColumn |
 * | DELETE /spreadsheets/:id/columns/:c                | 200 | removeColumn |
 * | GET    /spreadsheets/:id/cells/:r/:c               | 200 | cell         |
 * | PATCH  /spreadsheets/:id/cells/:r/:c  body {value} | 200 | setCell      |
 * | POST   /spreadsheets/:id/import  multipart "file" | 200 | import       |
 * | POST   /spreadsheets/:id/import/preview  multipart "file" | 200 | preview |
 * Statuses: not_found 404 · bad_request/validation 400 · conflict 409.
 *
 * IMPORT  POST /spreadsheets/:id/import — multipart, field "file", .csv,
 * .xlsx or .docx, <= 25 MB. REST only, no tRPC procedure: multipart does not belong on
 * the tRPC link, and a procedure would pull the parsers into src/trpc/**, the
 * graph the dashboard transpiles. Returns 200, not 201 — it creates no new
 * resource.
 *   SheetImportResult = { id; name; totalRows; totalColumns; rowCount;
 *                         cellCount; columnsMatched; columnsCreated;
 *                         columns: SheetColumn[] }   // every column, after
 * PREVIEW POST /spreadsheets/:id/import/preview — same upload, writes nothing.
 *   SheetImportPreview = { format: "csv"|"xlsx"|"docx"; tableCount; rowCount;
 *     columns: { source; skippedValues;
 *       target: { kind: "existing"; id; name; type }
 *             | { kind: "new"; name; type } }[];
 *     sampleRows: CellValue[][] }  // first 10 rows, one value per column
 *
 * NOTES
 * - Rows are sparse; row indexes are absolute grid positions. removeRow clears
 *   the row and never shifts later rows; a never-written row/cell reads back
 *   blank (columns: [] / value: null), not 404.
 * - A column carries two numbers and they are not the same thing. `index` is
 *   IDENTITY: the pk suffix, the wire id "col.<index>", and the address of
 *   every cell (Cell.columnIndex). It is append-only — a new column lands one
 *   past the highest stored index — and a deleted column's index becomes a
 *   permanent gap that is never reused, so index-derived ids never renumber.
 *   Deleting an index with no column is NOT_FOUND.
 * - `sortOrder` is POSITION, and it is always dense 0..n-1 per sheet: create
 *   appends at max+1, remove closes the gap it leaves (unlike its index),
 *   import appends new columns after the existing ones in file order, and reorderColumn shifts the columns
 *   between the old and new position by ±1 — left moves shift them +1, right
 *   moves shift them -1. Every list orders by sortOrder.
 * - reorderColumn writes ONLY sortOrder. No id, no index and no
 *   Cell.columnIndex moves, so every cell stays with its column. It returns
 *   the sheet's whole column order, and a same-position reorder is a no-op
 *   that still returns it. A newSortOrder past the last position is
 *   BAD_REQUEST rather than clamped — out of range means the caller's view of
 *   the order is stale.
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
 * - A sheet's column names are unique, compared trimmed and case-insensitively
 *   ("Company" = "company"): createColumn, and an updateColumn that renames,
 *   answer CONFLICT (`SPREADSHEET_COLUMN_NAME_TAKEN`, REST 409) and change
 *   nothing. A column may be "renamed" to its own name, in any case. An import
 *   never conflicts: a repeated header becomes "Name (2)", "Name (3)", ….
 * - updateColumn changing `type` does not convert or revalidate stored cells.
 * - `node` and `prompt` default to null. `prompt` belongs to the node, so a
 *   prompt without one is BAD_REQUEST (`SPREADSHEET_PROMPT_WITHOUT_NODE`;
 *   create checks the payload, update checks the effective stored+incoming
 *   pair). On updateColumn, `undefined` leaves a field unchanged and `null`
 *   clears it; `node: null` also clears `prompt`. Imported columns never
 *   carry a node.
 * - A Mail (`node: "email"`) column must be a `json` column — its cells hold
 *   `{address: sent email | "FAILED"}` — so create and update refuse any
 *   other effective type (BAD_REQUEST, `SPREADSHEET_EMAIL_COLUMN_TYPE`).
 *   Its cells are READ-ONLY: `setCell`, `updateRow` and `appendRow` refuse
 *   them (BAD_REQUEST, `SPREADSHEET_COLUMN_READ_ONLY`); only the run worker
 *   writes them (run-ai contract).
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
 * - Import **merges**, in one transaction (a failure leaves the sheet exactly
 *   as it was). A file column whose name matches an existing column fills it;
 *   any other file column becomes a new column after the existing ones. The
 *   file's rows are appended from one past the highest stored row. Nothing
 *   already stored is changed, so importing the same file twice appends twice.
 * - Names match heuristically, never by a model: equal after lowercasing and
 *   dropping punctuation/spaces/plural "s" ("E-mail" = "email"), a built-in
 *   synonym group ("Phone" = "Mobile No"), or near-equal words/spelling (score
 *   >= 0.85). Names differing in a digit ("Address 1"/"Address 2") never match.
 *   Matching is one-to-one, best score first.
 * - A matched column keeps its type: each file value is re-typed to it, and a
 *   value that does not fit is left blank and counted in the preview's
 *   `skippedValues` — never stored as the wrong type. New columns get the
 *   inferred type, renamed "Name (2)" if the sheet already uses the name.
 * - Existing + new columns may not exceed 256 (_TOO_LARGE).
 * - DOCX reads every table in document order. Tables with one row or a blank
 *   header are layout and skipped. The first table's header sets the columns;
 *   each later table's columns land on the most similar one or are appended.
 *   A row repeating its table's header is dropped. A table that only adds
 *   columns its group has not filled, with as many rows, continues those rows
 *   (a "Name, Age" + "Phone, City" pair per person is one row per person);
 *   otherwise its rows are appended. Merged cells repeat their value. A
 *   document with no data table is _EMPTY; `.doc` is rejected.
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
 *   is a 409 — an import only adds, so nothing about it can conflict.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { pingDatabase } from "../db/prisma";
import { spreadsheetService } from "../modules/spreadsheet/spreadsheet.service";
import { makeWorkspace, removeWorkspace } from "./support/fixtures";
import type { TestServer } from "./support/http";
import { jsonInit, startTestServer } from "./support/http";
import { caller, expectDate, expectTRPCError } from "./support/trpc";
import { csvBody, docxBody, xlsxBody } from "./support/upload";

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
    expect(sheet).toMatchObject({
      id: created.id,
      name: "readable",
      // Only onboarding sets these; a sheet made any other way has neither.
      description: null,
      purpose: null,
      formOutputEnabled: false,
    });
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
      sortOrder: 0,
      name: "First",
      type: "string",
      node: null,
      prompt: null,
    });
    expect(second).toEqual({
      id: "col.1",
      index: 1,
      sortOrder: 1,
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

    // A search node stores the same way: the prompt is its whole configuration.
    const search = await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Domain",
      type: "url",
      node: "google_search",
      prompt: "the official website of this company",
    });
    expect(search).toMatchObject({
      node: "google_search",
      prompt: "the official website of this company",
    });
    const cleared = await caller.spreadsheet.updateColumn({
      id: sheet.id,
      columnIndex: search.index,
      node: null,
    });
    expect(cleared).toMatchObject({ node: null, prompt: null });
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

  it("rejects a Mail column that is not json", async () => {
    const sheet = await makeSheet("mail column types");
    // The default type is string, so a bare mail node is refused too.
    await expectTRPCError(
      caller.spreadsheet.createColumn({
        id: sheet.id,
        name: "Mail",
        node: "email",
        prompt: "Say hi",
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.spreadsheet.createColumn({
        id: sheet.id,
        name: "Mail",
        type: "number",
        node: "email",
        prompt: "Say hi",
      }),
      "BAD_REQUEST",
    );
    const column = await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Mail",
      type: "json",
      node: "email",
      prompt: "Say hi",
    });
    expect(column).toMatchObject({ type: "json", node: "email" });
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

  it("refuses a name the sheet already has, in any case (CONFLICT)", async () => {
    const sheet = await makeSheet("duplicate column");
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "Company" });
    for (const name of ["Company", "company", "  COMPANY "]) {
      await expectTRPCError(
        caller.spreadsheet.createColumn({ id: sheet.id, name }),
        "CONFLICT",
      );
    }
    const { columns } = await caller.spreadsheet.rows({ id: sheet.id });
    expect(columns.map((column) => column.name)).toEqual(["Company"]);
    // Another sheet is another namespace.
    const other = await makeSheet("duplicate column elsewhere");
    await caller.spreadsheet.createColumn({ id: other.id, name: "Company" });
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
      sortOrder: 2,
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
      sortOrder: 0,
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
      type: "json",
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

  it("keeps the Mail json rule across updates", async () => {
    const sheet = await makeSheet("mail column update");
    await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Mail",
      type: "json",
      node: "email",
      prompt: "Say hi",
    });
    // A Mail column may not leave json…
    await expectTRPCError(
      caller.spreadsheet.updateColumn({
        id: sheet.id,
        columnIndex: 0,
        type: "string",
      }),
      "BAD_REQUEST",
    );
    // …and a non-json column may not become Mail…
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "Plain" });
    await expectTRPCError(
      caller.spreadsheet.updateColumn({
        id: sheet.id,
        columnIndex: 1,
        node: "email",
        prompt: "Say hi",
      }),
      "BAD_REQUEST",
    );
    // …unless the type moves to json in the same update.
    const moved = await caller.spreadsheet.updateColumn({
      id: sheet.id,
      columnIndex: 1,
      type: "json",
      node: "email",
      prompt: "Say hi",
    });
    expect(moved).toMatchObject({ type: "json", node: "email" });
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

  it("refuses a rename onto another column's name, but not onto its own (CONFLICT)", async () => {
    const sheet = await makeSheet("rename collision");
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "Company" });
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "Website" });
    await expectTRPCError(
      caller.spreadsheet.updateColumn({
        id: sheet.id,
        columnIndex: 1,
        name: "company",
      }),
      "CONFLICT",
    );
    expect(
      (await caller.spreadsheet.column({ id: sheet.id, columnIndex: 1 })).name,
    ).toBe("Website");
    // Its own name — re-cased, or alongside another field — is not a collision.
    const recased = await caller.spreadsheet.updateColumn({
      id: sheet.id,
      columnIndex: 1,
      name: "WEBSITE",
      type: "url",
    });
    expect(recased).toMatchObject({ name: "WEBSITE", type: "url" });
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

describe.skipIf(!dbUp)("spreadsheet.reorderColumn", () => {
  it("moves a column left, shifting the columns in between right", async () => {
    const sheet = await makeTypedSheet();
    const fourth = await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "extra",
    });
    expect(fourth.sortOrder).toBe(3);

    // The worked example: A(0) B(1) C(2) D(3) -> move D to 1 -> A D B C.
    const order = await caller.spreadsheet.reorderColumn({
      id: sheet.id,
      columnIndex: 3,
      newSortOrder: 1,
    });
    expect(order.map((c) => c.id)).toEqual([
      "col.0",
      "col.3",
      "col.1",
      "col.2",
    ]);
    expect(order.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3]);
    // Identity is untouched: only sortOrder moved.
    expect(order.map((c) => c.index)).toEqual([0, 3, 1, 2]);
    expect(order.map((c) => c.name)).toEqual(["text", "extra", "num", "tune"]);
  });

  it("moves a column right, shifting the columns in between left", async () => {
    const sheet = await makeTypedSheet();
    const order = await caller.spreadsheet.reorderColumn({
      id: sheet.id,
      columnIndex: 0,
      newSortOrder: 2,
    });
    expect(order.map((c) => c.id)).toEqual(["col.1", "col.2", "col.0"]);
    expect(order.map((c) => c.sortOrder)).toEqual([0, 1, 2]);
  });

  it("reorders to its own position as a no-op that still returns the order", async () => {
    const sheet = await makeTypedSheet();
    const order = await caller.spreadsheet.reorderColumn({
      id: sheet.id,
      columnIndex: 1,
      newSortOrder: 1,
    });
    expect(order.map((c) => c.id)).toEqual(["col.0", "col.1", "col.2"]);
    expect(order.map((c) => c.sortOrder)).toEqual([0, 1, 2]);
  });

  it("moves no cell: ids, indexes and values stay with their column", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
      value: "keep",
    });
    await caller.spreadsheet.setCell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 1,
      value: 7,
    });
    await caller.spreadsheet.reorderColumn({
      id: sheet.id,
      columnIndex: 0,
      newSortOrder: 2,
    });

    // The cell is still addressed by the same (rowIndex, columnIndex).
    const cell = await caller.spreadsheet.cell({
      id: sheet.id,
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(cell).toMatchObject({ id: "cell.0.0", value: "keep" });
    const column = await caller.spreadsheet.column({
      id: sheet.id,
      columnIndex: 0,
    });
    expect(column).toMatchObject({ id: "col.0", index: 0, sortOrder: 2 });
  });

  it("orders the rows payload and each row's entries by the new order", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.updateRow({
      id: sheet.id,
      rowIndex: 0,
      cells: [
        { columnIndex: 0, value: "first" },
        { columnIndex: 1, value: 7 },
      ],
    });
    await caller.spreadsheet.reorderColumn({
      id: sheet.id,
      columnIndex: 1,
      newSortOrder: 0,
    });
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.columns.map((c) => c.id)).toEqual([
      "col.1",
      "col.0",
      "col.2",
    ]);
    expect(payload.rows[0]?.columns).toEqual([
      { id: "col.1", name: "num", value: 7 },
      { id: "col.0", name: "text", value: "first" },
    ]);
  });

  it("rejects a sort order past the last position and a negative one", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.reorderColumn({
        id: sheet.id,
        columnIndex: 0,
        newSortOrder: 3,
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.spreadsheet.reorderColumn({
        id: sheet.id,
        columnIndex: 0,
        newSortOrder: -1,
      }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for a missing column and a missing sheet", async () => {
    const sheet = await makeTypedSheet();
    await expectTRPCError(
      caller.spreadsheet.reorderColumn({
        id: sheet.id,
        columnIndex: 9,
        newSortOrder: 0,
      }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      caller.spreadsheet.reorderColumn({
        id: "does-not-exist",
        columnIndex: 0,
        newSortOrder: 0,
      }),
      "NOT_FOUND",
    );
  });

  it("keeps the order dense when a reordered column is then removed", async () => {
    const sheet = await makeTypedSheet();
    await caller.spreadsheet.reorderColumn({
      id: sheet.id,
      columnIndex: 2,
      newSortOrder: 0,
    });
    await caller.spreadsheet.removeColumn({ id: sheet.id, columnIndex: 0 });
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.columns.map((c) => c.id)).toEqual(["col.2", "col.1"]);
    expect(payload.columns.map((c) => c.sortOrder)).toEqual([0, 1]);
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
    // The index gap is permanent; the sort-order gap is not — col.2 closes up.
    expect(payload.columns.map((c) => c.index)).toEqual([0, 2]);
    expect(payload.columns.map((c) => c.sortOrder)).toEqual([0, 1]);
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
    // Its index appends past the max; its sort order appends past the count.
    expect(created.sortOrder).toBe(2);

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

  it("rejects a write to a read-only Mail column", async () => {
    const sheet = await makeSheet("mail cell write");
    await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Mail",
      type: "json",
      node: "email",
      prompt: "Say hi",
    });
    await expectTRPCError(
      caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex: 0,
        columnIndex: 0,
        value: { "a@b.test": "Subject: x\n\ny" },
      }),
      "BAD_REQUEST",
    );
    // Clearing is a write too.
    await expectTRPCError(
      caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex: 0,
        columnIndex: 0,
        value: null,
      }),
      "BAD_REQUEST",
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

  it("rejects the whole batch when it touches a read-only Mail column", async () => {
    const sheet = await makeSheet("mail row write");
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "Note" });
    await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Mail",
      type: "json",
      node: "email",
      prompt: "Say hi",
    });
    await expectTRPCError(
      caller.spreadsheet.updateRow({
        id: sheet.id,
        rowIndex: 0,
        cells: [
          { columnIndex: 0, value: "fine" },
          { columnIndex: 1, value: { "a@b.test": "x" } },
        ],
      }),
      "BAD_REQUEST",
    );
    const row = await caller.spreadsheet.row({ id: sheet.id, rowIndex: 0 });
    expect(row.columns).toEqual([]); // nothing was written
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

  it("rejects an entry for a read-only Mail column", async () => {
    const sheet = await makeSheet("mail append");
    await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Mail",
      type: "json",
      node: "email",
      prompt: "Say hi",
    });
    await expectTRPCError(
      caller.spreadsheet.appendRow({
        id: sheet.id,
        cells: [{ columnIndex: 0, value: { "a@b.test": "x" } }],
      }),
      "BAD_REQUEST",
    );
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
  let server: TestServer;
  let baseUrl = "";

  beforeAll(async () => {
    server = await startTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(() => server.close());

  it("drives the full route surface", async () => {
    // POST /spreadsheets
    const createRes = await fetch(
      `${baseUrl}/spreadsheets`,
      jsonInit("POST", { name: "rest sheet", workspaceId }),
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
      jsonInit("POST", { name: "Age", type: "number" }),
    );
    expect(colRes.status).toBe(201);
    expect(await colRes.json()).toEqual({
      id: "col.0",
      index: 0,
      sortOrder: 0,
      name: "Age",
      type: "number",
      node: null,
      prompt: null,
    });

    // PATCH + GET a cell
    const patchCell = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/cells/0/0`,
      jsonInit("PATCH", { value: 26 }),
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
      sortOrder: 0,
      name: "Age",
      type: "number",
      node: null,
      prompt: null,
    });

    // PATCH /rows/:r + PATCH /columns/:c
    const patchRow = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows/1`,
      jsonInit("PATCH", { cells: [{ columnIndex: 0, value: 30 }] }),
    );
    expect(patchRow.status).toBe(200);
    const patchColumn = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/columns/0`,
      jsonInit("PATCH", { name: "Years" }),
    );
    expect(await patchColumn.json()).toMatchObject({ name: "Years" });

    // POST /columns/:c/reorder — 200 with the sheet's whole column order
    const reorder = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/columns/0/reorder`,
      jsonInit("POST", { newSortOrder: 0 }),
    );
    expect(reorder.status).toBe(200);
    expect(await reorder.json()).toEqual([
      {
        id: "col.0",
        index: 0,
        sortOrder: 0,
        name: "Years",
        type: "number",
        node: null,
        prompt: null,
      },
    ]);

    // POST /rows, DELETE /rows/:r, DELETE /columns/:c, DELETE /spreadsheets/:id
    const postRow = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows`,
      jsonInit("POST", {}),
    );
    expect(postRow.status).toBe(201);

    // POST /rows/append — the row lands past the highest stored index
    const appendRes = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows/append`,
      jsonInit("POST", { cells: [{ columnIndex: 0, value: 31 }] }),
    );
    expect(appendRes.status).toBe(201);
    const appended = (await appendRes.json()) as { index: number };
    expect(appended).toMatchObject({
      columns: [{ id: "col.0", value: 31 }],
    });

    // POST /rows/remove — 200, batch delete of the row just appended
    const removeRes = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows/remove`,
      jsonInit("POST", { rowIndexes: [appended.index] }),
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
      jsonInit("PATCH", { value: "hello" }),
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

    // 400 a reorder past the last position
    const outOfRange = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/columns/0/reorder`,
      jsonInit("POST", { newSortOrder: 2 }),
    );
    expect(outOfRange.status).toBe(400);
    expect(await outOfRange.json()).toMatchObject({
      code: "SPREADSHEET_SORT_ORDER_OUT_OF_RANGE",
    });

    // 409 creating a row at an already-stored index
    await caller.spreadsheet.createRow({ id: sheet.id, index: 0 });
    const exists = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/rows`,
      jsonInit("POST", { index: 0 }),
    );
    expect(exists.status).toBe(409);
    expect(await exists.json()).toMatchObject({
      code: "SPREADSHEET_ROW_EXISTS",
    });
  });

  /* ------------------------------------------------------------- import */

  // csvBody / xlsxBody (support/upload.ts) build the files in memory.
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
        sortOrder: number;
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
      sortOrder: 0,
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

  it("keeps existing columns and rows, fills matching columns and appends the file's rows", async () => {
    const sheet = await makeSheet("import merges");
    for (const name of ["Name", "Email", "Notes"]) {
      await caller.spreadsheet.createColumn({ id: sheet.id, name });
    }
    for (const rowIndex of [0, 1]) {
      await caller.spreadsheet.setCell({
        id: sheet.id,
        rowIndex,
        columnIndex: 2,
        value: "old",
      });
    }

    // "e-mail" matches "Email"; "City" is new.
    const res = await importInto(
      sheet.id,
      csvBody("name,e-mail,City\nAda,ada@x.test,London\n"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rowCount: number;
      cellCount: number;
      columnsMatched: number;
      columnsCreated: number;
      columns: { id: string; name: string; sortOrder: number }[];
    };
    expect(body).toMatchObject({
      rowCount: 1,
      cellCount: 3,
      columnsMatched: 2,
      columnsCreated: 1,
    });
    expect(body.columns.map((column) => [column.id, column.name])).toEqual([
      ["col.0", "Name"],
      ["col.1", "Email"],
      ["col.2", "Notes"],
      ["col.3", "City"],
    ]);
    expect(body.columns[3]?.sortOrder).toBe(3);

    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.rows.map((row) => row.index)).toEqual([0, 1, 2]);
    expect(payload.rows[0]?.columns).toEqual([
      { id: "col.2", name: "Notes", value: "old" },
    ]);
    expect(payload.rows[2]?.columns).toEqual([
      { id: "col.0", name: "Name", value: "Ada" },
      { id: "col.1", name: "Email", value: "ada@x.test" },
      { id: "col.3", name: "City", value: "London" },
    ]);
  });

  it("appends again when the same file is imported twice", async () => {
    const sheet = await makeSheet("import twice");
    const first = await importInto(sheet.id, csvBody(EVERY_TYPE_CSV));
    const second = await importInto(sheet.id, csvBody(EVERY_TYPE_CSV));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      totalColumns: 10,
      rowCount: 2,
      columnsMatched: 10,
      columnsCreated: 0,
    });
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    expect(payload.rows[2]?.columns).toEqual(payload.rows[0]?.columns);
  });

  it("leaves a value blank, and counts it, when it does not fit a matched column's type", async () => {
    const sheet = await makeSheet("import type mismatch");
    await caller.spreadsheet.createColumn({
      id: sheet.id,
      name: "Age",
      type: "number",
    });
    const csv = "Age\n41\nunknown\n";

    const preview = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/import/preview`,
      { method: "POST", body: csvBody(csv) },
    );
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      columns: [
        {
          source: "Age",
          target: { kind: "existing", id: "col.0", type: "number" },
          skippedValues: 1,
        },
      ],
      sampleRows: [[41], [null]],
    });

    const res = await importInto(sheet.id, csvBody(csv));
    expect(res.status).toBe(200);
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.rows.map((row) => row.columns[0]?.value ?? null)).toEqual([
      41,
      null,
    ]);
  });

  it("previews an import without writing anything", async () => {
    const sheet = await makeSheet("import preview");
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "Phone" });
    const res = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/import/preview`,
      {
        method: "POST",
        body: csvBody("Mobile No,Score\n555-0100,7\n555-0101,9\n"),
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      format: "csv",
      tableCount: 1,
      rowCount: 2,
      columns: [
        {
          source: "Mobile No",
          target: {
            kind: "existing",
            id: "col.0",
            name: "Phone",
            type: "string",
          },
          skippedValues: 0,
        },
        {
          source: "Score",
          target: { kind: "new", name: "Score", type: "number" },
          skippedValues: 0,
        },
      ],
      sampleRows: [
        ["555-0100", 7],
        ["555-0101", 9],
      ],
    });
    const meta = await caller.spreadsheet.byId({ id: sheet.id });
    expect(meta.totalColumns).toBe(1);
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.rows).toEqual([]);
  });

  it("merges a Word document's tables into common columns, in document order", async () => {
    const sheet = await makeSheet("import docx");
    const res = await importInto(
      sheet.id,
      await docxBody([
        [
          ["Name", "Email"],
          ["Ada", "ada@x.test"],
          ["Name", "Email"], // header repeated after a page break
          ["Alan", "alan@x.test"],
        ],
        [
          ["Full Name", "City"],
          ["Grace", "Arlington"],
        ],
        [["Signature"]], // one row: layout, not data
      ]),
    );
    expect(res.status).toBe(200);
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.columns.map((column) => column.name)).toEqual([
      "Name",
      "Email",
      "City",
    ]);
    expect(
      payload.rows.map((row) => row.columns.map((entry) => entry.value)),
    ).toEqual([
      ["Ada", "ada@x.test"],
      ["Alan", "alan@x.test"],
      ["Grace", "Arlington"],
    ]);
    expect(payload.columns[1]?.type).toBe("email");

    const preview = await fetch(
      `${baseUrl}/spreadsheets/${sheet.id}/import/preview`,
      {
        method: "POST",
        body: await docxBody([
          [["Name"], ["Linus"]],
          [["Town"], ["Turku"]],
        ]),
      },
    );
    expect(await preview.json()).toMatchObject({
      format: "docx",
      tableCount: 2,
      // "Town" is a column the first table did not fill: same row, not a new one.
      rowCount: 1,
      sampleRows: [["Linus", "Turku"]],
    });
  });

  it("joins a document's repeating table groups into one row per group", async () => {
    const sheet = await makeSheet("import docx groups");
    const person = (name: string, age: string, phone: string) => [
      [
        ["Name", "Age"],
        [name, age],
      ],
      [
        ["Phone", "City"],
        [phone, "London"],
      ],
    ];
    const res = await importInto(
      sheet.id,
      await docxBody([
        ...person("Ada", "36", "555-0001"),
        ...person("Alan", "41", "555-0002"),
      ]),
    );
    expect(res.status).toBe(200);
    const payload = await caller.spreadsheet.rows({ id: sheet.id });
    expect(payload.columns.map((column) => column.name)).toEqual([
      "Name",
      "Age",
      "Phone",
      "City",
    ]);
    expect(
      payload.rows.map((row) => row.columns.map((entry) => entry.value)),
    ).toEqual([
      ["Ada", 36, "555-0001", "London"],
      ["Alan", 41, "555-0002", "London"],
    ]);
  });

  it("refuses an import that would take the sheet past the column cap", async () => {
    const sheet = await makeSheet("import column cap");
    await caller.spreadsheet.createColumn({ id: sheet.id, name: "existing" });
    const header = Array.from({ length: 256 }, (_, i) => `c${i}`).join(",");
    const res = await importInto(sheet.id, csvBody(`${header}\n`));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "SPREADSHEET_IMPORT_TOO_LARGE",
    });
    expect((await caller.spreadsheet.byId({ id: sheet.id })).totalColumns).toBe(
      1,
    );
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

  it("numbers a repeated header instead of creating a duplicate column name", async () => {
    const sheet = await makeSheet("import repeated headers");
    const res = await importInto(
      sheet.id,
      csvBody("Name,name,Email,NAME\nAda,Lovelace,ada@x.test,Countess\n"),
    );
    expect(res.status).toBe(200);
    const { columns } = await caller.spreadsheet.rows({ id: sheet.id });
    expect(columns.map((column) => column.name)).toEqual([
      "Name",
      "name (2)",
      "Email",
      "NAME (3)",
    ]);
  });

  it("maps every import failure to its status and code", async () => {
    const sheet = await makeSheet("import failures");

    const cases: [FormData, string][] = [
      [csvBody("x", "notes.txt"), "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE"],
      [csvBody("legacy", "book.xls"), "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE"],
      [csvBody("legacy", "notes.doc"), "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE"],
      [csvBody("not a zip", "notes.docx"), "SPREADSHEET_IMPORT_UNREADABLE"],
      [await docxBody([[["only a header"]]]), "SPREADSHEET_IMPORT_EMPTY"],
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
