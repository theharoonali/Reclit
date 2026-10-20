# 037 — Import: preview, merge into existing columns, Word tables

**Status:** implemented
**Scope:** full feature

## Goal

Import on `/ai-spreadsheet` no longer wipes the sheet. Picking a file opens a
read-only preview: where each file column lands (an existing column with a
similar name, or a new column with its inferred type), how many rows will be
added, values that do not fit a matched column, and the first rows as they will
be stored. Confirm appends the rows below the existing ones; Cancel writes
nothing. Word documents (.docx) import too: every table in the document, with
tables of different headers combined into common columns and rows kept in
document order.

Decided with the user: rows are appended (no upsert by key); matching is
heuristic only (no model call); the preview is read-only (no mapping editor);
a document's tables are all merged in order.

## Backend (Agent 1)

- **Tables:** none.
- **Procedures:**

  | Procedure | Kind | Payload | Response | Errors |
  | --- | --- | --- | --- | --- |
  | `POST /spreadsheets/:id/import/preview` | REST multipart | `file` | `SheetImportPreview` | 400 import codes, 404 |
  | `POST /spreadsheets/:id/import` | REST multipart (changed: merges) | `file` | `SheetImportResult` + `columnsMatched`, `columnsCreated` | 400 import codes, 404 |

- **Service methods:** `SpreadsheetImportService.preview`, `import` (now a
  merge), private `read` / `plan` / `merge`; `replaceAll` kept for onboarding.
- **New pure modules:** `spreadsheet-import.docx.ts` (tables out of
  `word/document.xml`), `spreadsheet-import.match.ts` (name similarity,
  one-to-one matching, `unionTables`), `spreadsheet-import.plan.ts`
  (`planMerge`), `spreadsheet-import.records.ts` (the `createMany` payloads).
- Reused: `inferSheet`, `coerce` + `cellValueMatchesType` (via the new
  `coerceTo`), `uniqueName`, `nextRowIndex`, `columnsOf`, `chunk`.

## Frontend (Agent 2)

- `use-sheet-import.ts`: `pick` → preview, `confirm` → import, `cancel`.
- New `ai-spreadsheet-import-dialog.tsx` + `ai-spreadsheet-import-sample.tsx`
  (shared `Dialog` and `Table`), mounted by `ai-spreadsheet-import-button.tsx`.
- Tokens: `max-w-import-dialog`, `max-h-import-section`.

## Integration (Agent 3)

- Confirm flushes pending cell writes, imports, flushes again, resets the
  editor and invalidates `spreadsheet.rows` + `spreadsheet.list` — the same
  in-place refresh as before.

## Decisions

- Stateless preview: confirm re-uploads the file and the server re-plans it,
  rather than caching an upload server-side between two requests.
- A value that does not fit a matched column's type is left blank and counted,
  never stored as the wrong type and never demoting the existing column.
- Names differing only in a digit never match ("Address 1"/"Address 2"); the
  threshold is conservative because a wrong match pours data into the wrong
  column while a missed one only adds a column.
- Unsaved edits are flushed, not discarded: an import no longer replaces the
  rows they belong to.
- Repeating table groups join into one row: a table whose columns are all
  new to its group and whose row count matches continues the group's rows
  instead of appending half-empty ones (asked for after the first version
  stacked them). Different row counts still stack, so two unrelated lists
  are never zipped together.
- Docx read with a tag scanner over `word/document.xml` (jszip, already present
  through exceljs) instead of adding an XML parser or mammoth.

## Risks / open questions

- A table continued across a page break *without* a repeated header becomes a
  second table whose first data row is read as a header. Settling it needs a
  rule for "header-less continuation" (e.g. same width, no name matches).

---

## Outcome

- **Shipped:** as above. API in `apps/api/src/modules/spreadsheet/`
  (`spreadsheet-import.{docx,match,plan,records,service,parse,infer}.ts`,
  controller route, schema); dashboard in
  `apps/dashboard/src/components/ai-spreadsheet/` and
  `lib/ai-spreadsheet/import-file.ts`.
- **Deviated:** no `fast-xml-parser` dependency — a tag scanner over the
  document XML was enough. `rowsAppended` was not added to the result;
  `rowCount` already is that number.
- **Not done:** an editable mapping in the preview; upsert by key column.
- **Docs updated:** `features/spreadsheet.md`, `routes/ai-spreadsheet.md`, the
  contract header in `spreadsheet.api.test.ts`, new
  `spreadsheet-import.match.test.ts`.
