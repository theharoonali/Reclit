# `spreadsheet`

**Purpose:** persistent storage for the AI spreadsheet — sheets, typed columns,
sparse rows, and JSON-valued cells addressed by predictable index-derived ids.

**Contract:** `apps/api/src/__tests__/spreadsheet.api.test.ts` — payloads,
responses, and error codes live in its header. Do not duplicate them here.

## Tables `Spreadsheet`, `Column`, `Row`, `Cell`

| Column | Type | Notes |
| --- | --- | --- |
| `Spreadsheet.id` | `String` | pk, `@default(uuid())` |
| `Spreadsheet.name` | `String` | required — kept equal to the workspace's name by `workspace.create`/`rename` |
| `Spreadsheet.totalRows` | `Int` | default 5,000,000 (`DEFAULT_TOTAL_ROWS`) — the virtual grid height |
| `Spreadsheet.workspaceId` | `String` | required, fk cascade → `Workspace`, indexed ([workspace.md](workspace.md)) |
| `Column.id` | `String` | pk, scoped `"<sheetId>.col.<index>"` |
| `Column.index` / `name` / `type` | `Int` / `String` / `ColumnType` | unique(spreadsheetId, index) |
| `Column.node` | `NodeType?` | automated-processing kind; null = plain column |
| `Column.prompt` | `String?` | the node's instruction; null without a node |
| `Row.id` | `String` | pk, scoped `"<sheetId>.row.<index>"`; rows are sparse |
| `Cell.id` | `String` | pk, scoped `"<sheetId>.cell.<row>.<col>"` |
| `Cell.value` | `Json?` | never stored null — clearing deletes the record |
| `createdAt` / `updatedAt` | `DateTime` | on all four models |

`ColumnType`: `STRING NUMBER BOOLEAN DATE JSON FORMULA AUDIO FILE EMAIL URL` ·
`NodeType`: `AI EMAIL` (both lowercase on the wire). Scoped pks are a recorded
deviation from the uuid rule
(docs/plans/005-spreadsheet-backend.md): they make the wire ids predictable
(`row.0`, `col.1`, `cell.0.1`) and a cell write a single upsert by pk.

Indexes: `unique(spreadsheetId, index)` on Column/Row,
`unique(spreadsheetId, rowIndex, columnIndex)` + `(spreadsheetId, rowIndex)` on
Cell · Relations: all cascade from Spreadsheet · Migrations:
`apps/api/prisma/migrations/`

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | the four tables + `ColumnType` |
| `apps/api/src/modules/spreadsheet/spreadsheet.ids.ts` | schema | scoped/short id builders |
| `apps/api/src/modules/spreadsheet/spreadsheet.schema.ts` | schema | zod shapes, wire↔db type case, `cellValueMatchesType` |
| `apps/api/src/modules/spreadsheet/spreadsheet.errors.ts` | schema | the domain errors |
| `apps/api/src/modules/spreadsheet/spreadsheet.shape.ts` | schema | records → nested `SheetRow` assembly |
| `apps/api/src/modules/spreadsheet/spreadsheet.service.ts` | service | reads + sheet lifecycle, `columnOrThrow` |
| `apps/api/src/modules/spreadsheet/spreadsheet-cells.service.ts` | service | grid writes (cells, rows, columns) |
| `apps/api/src/modules/spreadsheet/spreadsheet-import.parse.ts` | schema | CSV/XLSX bytes → a raw grid of strings |
| `apps/api/src/modules/spreadsheet/spreadsheet-import.infer.ts` | schema | grid → columns with inferred types and coerced values |
| `apps/api/src/modules/spreadsheet/spreadsheet-import.service.ts` | service | parses an upload and replaces the whole grid in one transaction |
| `apps/api/src/modules/spreadsheet/spreadsheet.controller.ts` | controller | the predictable REST paths |
| `apps/api/src/trpc/routers/spreadsheet.ts` | router | the 17 procedures |
| `apps/api/prisma/seed.ts` | — | seeds the default user + "Customers" workspace/sheet via the services |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `spreadsheet.list` | query | `SpreadsheetService.list` | — |
| `spreadsheet.byId` | query | `SpreadsheetService.byId` | NOT_FOUND |
| `spreadsheet.create` | mutation | `SpreadsheetService.create` | BAD_REQUEST, NOT_FOUND (workspace) |
| `spreadsheet.remove` | mutation | `SpreadsheetService.remove` | NOT_FOUND |
| `spreadsheet.rows` | query | `SpreadsheetService.rows` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.row` | query | `SpreadsheetService.row` | NOT_FOUND |
| `spreadsheet.column` | query | `SpreadsheetService.column` | NOT_FOUND |
| `spreadsheet.cell` | query | `SpreadsheetService.cell` | NOT_FOUND |
| `spreadsheet.setCell` | mutation | `SpreadsheetCellsService.setCell` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.updateRow` | mutation | `SpreadsheetCellsService.updateRow` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.createRow` | mutation | `SpreadsheetCellsService.createRow` | NOT_FOUND, CONFLICT |
| `spreadsheet.appendRow` | mutation | `SpreadsheetCellsService.appendRow` | NOT_FOUND, BAD_REQUEST, CONFLICT |
| `spreadsheet.removeRow` | mutation | `SpreadsheetCellsService.removeRow` | NOT_FOUND |
| `spreadsheet.removeRows` | mutation | `SpreadsheetCellsService.removeRows` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.createColumn` | mutation | `SpreadsheetCellsService.createColumn` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.updateColumn` | mutation | `SpreadsheetCellsService.updateColumn` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.removeColumn` | mutation | `SpreadsheetCellsService.removeColumn` | NOT_FOUND |

| `POST /spreadsheets/:id/import` | REST only | `SpreadsheetImportService.import` | NOT_FOUND, BAD_REQUEST |

Every operation also exists as a REST route under `/spreadsheets` (same
services, same shapes) — the route table lives in the contract header. Import is
REST only: multipart does not belong on the tRPC link, and a procedure would
pull the parsers into `src/trpc/**`, which the dashboard transpiles.

## Behaviour

- Every sheet belongs to a workspace (`workspaceId` required on `create`; a
  missing workspace is NOT_FOUND). The app creates sheets through
  `workspace.create`, which names the sheet after the workspace;
  `spreadsheet.create` itself does not enforce one-sheet-per-workspace.
- Rows are sparse; indexes are absolute grid positions. `removeRow` clears and
  never shifts. Never-written rows/cells read back blank, not 404.
- Columns are append-only: a new column lands one past the highest stored
  `index`. Any column can be deleted (`removeColumn` drops it and its cells in
  one transaction); its index becomes a permanent gap that is never reused, so
  index-derived ids never renumber.
- `setCell` validates the value against the column type in the service
  (`cellValueMatchesType`) and upserts row + cell by pk in one transaction;
  `value: null` deletes the cell.
- `appendRow` writes a new row at one past the highest stored index, row +
  cells in one transaction. The index race with concurrent appends is retried
  internally (CONFLICT only after retries are exhausted); `value: null` entries
  write no cell. Its REST twin is `POST /spreadsheets/:id/rows/append`.
- `removeRows` is `removeRow` for a batch (1..10,000 indexes): one transaction,
  duplicates collapsed, never-stored indexes are no-ops, nothing shifts. Its
  REST twin is `POST /spreadsheets/:id/rows/remove` (200 — a delete creates
  nothing).
- `updateColumn` changing `type` does not convert or revalidate stored cells.
- `node`/`prompt` default to null; a prompt without a node is BAD_REQUEST
  (create checks the payload, update the effective stored+incoming pair). On
  `updateColumn`, `undefined` leaves a field unchanged, `null` clears it, and
  `node: null` also clears `prompt`. Imported columns never carry a node.
  Nothing executes prompts yet (docs/plans/011-column-node.md).
- `FORMULA` is storage-only; nothing evaluates formulas.
- `rows` pages *stored* rows (`startRow`/`limit` capped at 500, take limit+1 →
  `hasMore`, `nextCursor`). The dashboard walks every page and merges them, so
  the cap bounds one response rather than what a sheet can show.
- **Import is a full replace.** `POST /spreadsheets/:id/import` deletes every
  Column, Row and Cell and rebuilds them from the file in one transaction, so a
  failure leaves the sheet untouched and re-importing the same file is a no-op.
  It is the only operation that rebuilds the grid wholesale.
- Row 0 of the file names the columns. A column's type is inferred only if
  *every* non-empty value fits it, tried boolean → number → date → json →
  email → url → string; a `url` column of audio extensions becomes `audio`,
  of known file extensions `file`. `formula` is never inferred. Values are
  coerced before storage, so an imported value always satisfies the same check
  `setCell` applies. Only `true`/`false`/`yes`/`no` infer boolean (never
  `1`/`0`), a leading zero is never a number, and a bare number is never a date.
- An import does **not** change `totalRows` — that is the virtual grid height,
  not a row count. A blank cell writes no record; a blank row still writes a Row.
  XLSX reads the first worksheet only; `.xls` is rejected.

## Reusable pieces

- `SpreadsheetImportService.replaceAll` is the only full-grid wipe-and-rebuild;
  `removeColumn` drops single columns, leaving index gaps.
- `src/common/multipart.ts` `MulterFile`/`MAX_UPLOAD_BYTES`, and
  `src/common/upload.ts` `@UploadFile()`/`requireFile()`, for any REST upload.
- `isPlainObject` and `cellValueMatchesType` in `spreadsheet.schema.ts` — the
  import inference reuses both rather than re-implementing the type rules.
- `src/common/schema.ts` `idInput`/`paginationInput`; `src/common/errors.ts`
  `DomainError`; `src/common/prisma-errors.ts`; `mapDomainError` in
  `src/trpc/init.ts`; `DomainErrorFilter` for any future REST controller.

## Used by

- `/ai-spreadsheet` ([route doc](../routes/ai-spreadsheet.md)) — `rows` for the
  active workspace's sheet on load; `setCell`, `createColumn`, `updateColumn`,
  `removeColumn`, `removeRows` from the grid.
- `workspace.create`/`rename` write sheets directly inside their transactions
  ([workspace.md](workspace.md)).
- `/form/[spreadsheetId]` ([route doc](../routes/form.md)) — `rows` (limit 1,
  for name + columns) on load; `appendRow` on submit.
