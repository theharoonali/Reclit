/**
 * CONTRACT — populate
 * Feature doc: docs/features/populate.md · Rules: docs/rules/TESTING.md
 *
 * No table. Populate fills a sheet from outside the grid — the public form
 * (`/form/<id>`) and the REST API are the same two operations. Fields are
 * addressed by column NAME.
 *
 * MODELS
 *   PopulateField      = { name: string; type: ColumnType; columnIndex: number }
 *   PopulateForm       = { spreadsheet: { id: string; name: string };
 *                          fields: PopulateField[] }
 *   PopulateSubmission = { row: SheetRow; runs: RunAi[];
 *                          runError: { code: string; message: string } | null }
 *   CellValue          = string (≤10 000) | number | boolean | object | null
 *   SheetRow — see spreadsheet.api.test.ts · RunAi — see run-ai.api.test.ts
 *
 * PROCEDURES
 * | Procedure       | Kind     | Payload                                       | Response           | Errors                 |
 * | --------------- | -------- | --------------------------------------------- | ------------------ | ---------------------- |
 * | populate.form   | query    | { id }                                        | PopulateForm       | NOT_FOUND              |
 * | populate.submit | mutation | { id; fields: Record<columnName, CellValue> } | PopulateSubmission | NOT_FOUND, BAD_REQUEST |
 *
 * REST — the Populate API (same service, same zod inputs)
 * | GET  /populate/:id                     | 200 | form   |
 * | POST /populate/:id   body { fields }   | 201 | submit |
 * Errors: `{ statusCode, code, message }` — 400 VALIDATION_FAILED ·
 * 400 POPULATE_UNKNOWN_FIELD · 400 POPULATE_FIELD_NOT_FILLABLE ·
 * 400 SPREADSHEET_CELL_TYPE_MISMATCH · 404 SPREADSHEET_NOT_FOUND.
 *
 * NOTES
 * - A column is fillable when it is not a formula and carries no node; AI
 *   columns are computed, never filled. `form.fields` is in display order.
 * - Column names are unique per sheet (`spreadsheet.createColumn`), but a sheet
 *   older than that rule may hold duplicates: the first fillable column in
 *   display order owns the name, and a later duplicate is absent from
 *   `form.fields`.
 * - Names match exactly (case-sensitive, untrimmed). A name no column has is
 *   POPULATE_UNKNOWN_FIELD; a name only formula/AI columns have is
 *   POPULATE_FIELD_NOT_FILLABLE. A refused submission writes nothing.
 * - Values follow the column type exactly as `spreadsheet.appendRow`:
 *   audio / file / url are http(s) URL strings (upload through POST /files
 *   first), email an address, json an object. `null` entries write no cell;
 *   at least one entry must be non-null, and at most 256 entries.
 * - The row lands at one past the highest stored row index.
 * - After the row is saved, every runnable column (node `ai` or
 *   `google_search` with a prompt) is started for that row: `runs` are the
 *   `pending` runs in series order, exactly as `runAi.runCells` returns them.
 *   A sheet with no runnable column answers `runs: []`.
 * - Once the row is saved the submission never fails: if starting the runs
 *   throws, `runs` is `[]` and `runError` carries the code (e.g.
 *   RUN_AI_DISPATCH_FAILED). Do not retry on `runError` — the row exists.
 * - CORS is an allowlist (ALLOWED_API_ORIGINS): server-to-server callers are
 *   unaffected, a browser on another origin is refused.
 * - Every procedure is public; there is no auth and no rate limit yet.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { pingDatabase, prisma } from "../db/prisma";
import type { RunAiBatchJob } from "../modules/run-ai/run-ai.schema";
import { runAiBatchService } from "../modules/run-ai/run-ai-batch.service";
import { columnId } from "../modules/spreadsheet/spreadsheet.ids";
import { makeWorkspace, removeWorkspace } from "./support/fixtures";
import type { TestServer } from "./support/http";
import { jsonInit, startTestServer } from "./support/http";
import { caller, expectTRPCError } from "./support/trpc";

const dbUp = await pingDatabase();

// Display order: Company | Website (url) | Score (number) | Summary (AI) |
// Draft (AI, no prompt) | Calc (formula) | Company (duplicate).
let sheet = "";
let plainSheet = "";
const workspaceIds: string[] = [];
const column = { company: 0, website: 0, score: 0, summary: 0, duplicate: 0 };

beforeAll(async () => {
  if (!dbUp) return;
  const workspace = await makeWorkspace("populate contract");
  workspaceIds.push(workspace.id);
  sheet = workspace.spreadsheetId ?? "";
  const add = async (input: {
    name: string;
    type?: "string" | "url" | "number" | "formula";
    node?: "ai";
    prompt?: string;
  }) => (await caller.spreadsheet.createColumn({ id: sheet, ...input })).index;
  column.company = await add({ name: "Company" });
  column.website = await add({ name: "Website", type: "url" });
  column.score = await add({ name: "Score", type: "number" });
  column.summary = await add({
    name: "Summary",
    node: "ai",
    prompt: "Summarise the company in five words.",
  });
  await add({ name: "Draft", node: "ai" });
  await add({ name: "Calc", type: "formula" });
  // The API refuses a second "Company" (SPREADSHEET_COLUMN_NAME_TAKEN); sheets
  // older than that rule can still hold one, so it is planted directly.
  column.duplicate = 6;
  await prisma.column.create({
    data: {
      id: columnId(sheet, column.duplicate),
      spreadsheetId: sheet,
      index: column.duplicate,
      sortOrder: column.duplicate,
      name: "Company",
    },
  });

  const plain = await makeWorkspace("populate contract plain");
  workspaceIds.push(plain.id);
  plainSheet = plain.spreadsheetId ?? "";
  await caller.spreadsheet.createColumn({ id: plainSheet, name: "Note" });
});

afterAll(async () => {
  runAiBatchService.setDispatcher(null);
  if (!dbUp) return;
  await prisma.runAi.deleteMany({
    where: { spreadsheetId: { in: [sheet, plainSheet] } },
  });
  for (const id of workspaceIds) await removeWorkspace(id);
});

const valueAt = async (rowIndex: number, columnIndex: number) =>
  (await caller.spreadsheet.cell({ id: sheet, rowIndex, columnIndex })).value;

describe.skipIf(!dbUp)("populate.form", () => {
  it("returns the sheet's name and only its fillable columns, in display order", async () => {
    const form = await caller.populate.form({ id: sheet });
    expect(form.spreadsheet.id).toBe(sheet);
    expect(typeof form.spreadsheet.name).toBe("string");
    expect(form.fields).toEqual([
      { name: "Company", type: "string", columnIndex: column.company },
      { name: "Website", type: "url", columnIndex: column.website },
      { name: "Score", type: "number", columnIndex: column.score },
    ]);
  });

  it("lists a duplicated name once, as the first column in display order", async () => {
    const { fields } = await caller.populate.form({ id: sheet });
    const companies = fields.filter((field) => field.name === "Company");
    expect(companies).toHaveLength(1);
    expect(companies[0]?.columnIndex).toBe(column.company);
    expect(companies[0]?.columnIndex).not.toBe(column.duplicate);
  });

  it("carries no row data", async () => {
    const form = await caller.populate.form({ id: sheet });
    expect(Object.keys(form).sort()).toEqual(["fields", "spreadsheet"]);
  });

  it("rejects an unknown sheet", async () => {
    await expectTRPCError(caller.populate.form({ id: "missing" }), "NOT_FOUND");
  });
});

describe.skipIf(!dbUp)("populate.submit", () => {
  it("appends a row from the minimal payload, readable back", async () => {
    const { row } = await caller.populate.submit({
      id: sheet,
      fields: { Company: "Acme" },
    });
    expect(row.id).toBe(`row.${row.index}`);
    expect(await valueAt(row.index, column.company)).toBe("Acme");
  });

  it("writes every named field to its column and appends past the last row", async () => {
    const first = await caller.populate.submit({
      id: sheet,
      fields: { Company: "Initech" },
    });
    const { row } = await caller.populate.submit({
      id: sheet,
      fields: { Company: "Globex", Website: "https://globex.test", Score: 7 },
    });
    expect(row.index).toBe(first.row.index + 1);
    expect(await valueAt(row.index, column.company)).toBe("Globex");
    expect(await valueAt(row.index, column.website)).toBe(
      "https://globex.test",
    );
    expect(await valueAt(row.index, column.score)).toBe(7);
    // The duplicate "Company" column is never the target.
    expect(await valueAt(row.index, column.duplicate)).toBeNull();
  });

  it("writes no cell for a null entry", async () => {
    const { row } = await caller.populate.submit({
      id: sheet,
      fields: { Company: "Hooli", Score: null },
    });
    expect(await valueAt(row.index, column.score)).toBeNull();
  });

  it("rejects empty fields", async () => {
    await expectTRPCError(
      caller.populate.submit({ id: sheet, fields: {} }),
      "BAD_REQUEST",
    );
  });

  it("rejects fields that are all null", async () => {
    await expectTRPCError(
      caller.populate.submit({ id: sheet, fields: { Company: null } }),
      "BAD_REQUEST",
    );
  });

  it("rejects a name no column has", async () => {
    await expectTRPCError(
      caller.populate.submit({ id: sheet, fields: { company: "lowercase" } }),
      "BAD_REQUEST",
    );
  });

  it("rejects a formula or AI column's name", async () => {
    await expectTRPCError(
      caller.populate.submit({ id: sheet, fields: { Summary: "mine" } }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.populate.submit({ id: sheet, fields: { Calc: "=1+1" } }),
      "BAD_REQUEST",
    );
  });

  it("rejects a value that does not fit the column type", async () => {
    await expectTRPCError(
      caller.populate.submit({ id: sheet, fields: { Website: "not a url" } }),
      "BAD_REQUEST",
    );
  });

  it("rejects an unknown sheet", async () => {
    await expectTRPCError(
      caller.populate.submit({ id: "missing", fields: { Company: "x" } }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("populate.submit — AI trigger", () => {
  afterEach(() => runAiBatchService.setDispatcher(null));

  it("starts one pending run per runnable column of the new row", async () => {
    const { row, runs, runError } = await caller.populate.submit({
      id: sheet,
      fields: { Company: "Umbrella" },
    });
    expect(runError).toBeNull();
    // Summary runs; Draft (no prompt) is skipped.
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      cellId: `${sheet}.cell.${row.index}.${column.summary}`,
      spreadsheetId: sheet,
      status: "pending",
    });
    const active = await caller.runAi.listActive({ spreadsheetId: sheet });
    expect(active.map((run) => run.id)).toContain(runs[0]?.id ?? "");
  });

  it("hands the worker one batch holding the new row's wave", async () => {
    const dispatched: RunAiBatchJob[] = [];
    runAiBatchService.setDispatcher(async (batch) => {
      dispatched.push(batch);
    });
    const { row, runs } = await caller.populate.submit({
      id: sheet,
      fields: { Company: "Stark" },
    });
    expect(dispatched).toEqual([
      {
        batchId: runs[0]?.batchId ?? "",
        spreadsheetId: sheet,
        waves: [
          {
            columnIndex: column.summary,
            columnName: "Summary",
            cells: [{ runId: runs[0]?.id ?? "", rowIndex: row.index }],
          },
        ],
      },
    ]);
  });

  it("still succeeds when the dispatch fails, reporting runError", async () => {
    runAiBatchService.setDispatcher(async () => {
      throw new Error("worker unreachable");
    });
    const { row, runs, runError } = await caller.populate.submit({
      id: sheet,
      fields: { Company: "Wayne" },
    });
    expect(runs).toEqual([]);
    expect(runError?.code).toBe("RUN_AI_DISPATCH_FAILED");
    expect(await valueAt(row.index, column.company)).toBe("Wayne");
    const active = await caller.runAi.listActive({ spreadsheetId: sheet });
    expect(
      active.some((run) =>
        run.cellId.startsWith(`${sheet}.cell.${row.index}.`),
      ),
    ).toBe(false);
  });

  it("answers no runs for a sheet without a runnable column", async () => {
    const { runs, runError } = await caller.populate.submit({
      id: plainSheet,
      fields: { Note: "hello" },
    });
    expect(runs).toEqual([]);
    expect(runError).toBeNull();
  });
});

describe.skipIf(!dbUp)("REST /populate", () => {
  let server: TestServer;
  let baseUrl = "";

  beforeAll(async () => {
    server = await startTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(() => server.close());

  it("GET /populate/:id answers the form", async () => {
    const res = await fetch(`${baseUrl}/populate/${sheet}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fields: { name: string }[] };
    expect(body.fields.map((field) => field.name)).toEqual([
      "Company",
      "Website",
      "Score",
    ]);
  });

  it("POST /populate/:id appends the row and answers 201", async () => {
    const res = await fetch(
      `${baseUrl}/populate/${sheet}`,
      jsonInit("POST", { fields: { Company: "Rest Inc", Score: 3 } }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      row: { index: number };
      runs: { status: string }[];
      runError: null;
    };
    expect(body.runError).toBeNull();
    expect(body.runs.map((run) => run.status)).toEqual(["pending"]);
    expect(await valueAt(body.row.index, column.company)).toBe("Rest Inc");
  });

  it("answers 400 with the domain code", async () => {
    const cases: [unknown, string][] = [
      [{ fields: {} }, "VALIDATION_FAILED"],
      [{ fields: { Nope: "x" } }, "POPULATE_UNKNOWN_FIELD"],
      [{ fields: { Summary: "x" } }, "POPULATE_FIELD_NOT_FILLABLE"],
      [{ fields: { Score: "seven" } }, "SPREADSHEET_CELL_TYPE_MISMATCH"],
    ];
    for (const [payload, code] of cases) {
      const res = await fetch(
        `${baseUrl}/populate/${sheet}`,
        jsonInit("POST", payload),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe(code);
    }
  });

  it("answers 404 for an unknown sheet", async () => {
    const res = await fetch(
      `${baseUrl}/populate/missing`,
      jsonInit("POST", { fields: { Company: "x" } }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe(
      "SPREADSHEET_NOT_FOUND",
    );
  });
});
