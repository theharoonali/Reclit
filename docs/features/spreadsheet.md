# `spreadsheet`

**Purpose:** persistent storage for the AI spreadsheet — sheets, typed columns,
sparse rows, and JSON-valued cells addressed by predictable index-derived ids.

**Contract:** `apps/api/src/__tests__/spreadsheet.api.test.ts` — payloads,
responses, REST routes, error codes and every client-visible behaviour
(ordering, defaults, limits, import rules) live in its header. Do not duplicate
them here.

## Tables `Spreadsheet`, `Column`, `Row`, `Cell`

| Column | Type | Notes |
| --- | --- | --- |
| `Spreadsheet.id` | `String` | pk, `@default(uuid())` |
| `Spreadsheet.name` | `String` | required — kept equal to the workspace's name by `workspace.create`/`rename` |
| `Spreadsheet.totalRows` | `Int` | default 5,000,000 (`DEFAULT_TOTAL_ROWS`) — the virtual grid height |
| `Spreadsheet.workspaceId` | `String` | required, fk cascade → `Workspace`, indexed ([workspace.md](workspace.md)) |
| `Column.id` | `String` | pk, scoped `"<sheetId>.col.<index>"` |
| `Column.index` / `name` / `type` | `Int` / `String` / `ColumnType` | unique(spreadsheetId, index). `index` is **identity** — the pk suffix and the address in `Cell.columnIndex` — and never changes |
| `Column.sortOrder` | `Int` | **position**: display order, always dense `0..n-1` per sheet. Indexed, deliberately not unique — see below |
| `Column.node` | `NodeType?` | automated-processing kind; null = plain column |
| `Column.prompt` | `String?` | the node's instruction; null without a node |
| `Row.id` | `String` | pk, scoped `"<sheetId>.row.<index>"`; rows are sparse |
| `Cell.id` | `String` | pk, scoped `"<sheetId>.cell.<row>.<col>"` |
| `Cell.value` | `Json?` | never stored null — clearing deletes the record |
| `createdAt` / `updatedAt` | `DateTime` | on all four models |

`ColumnType`: `STRING NUMBER BOOLEAN DATE JSON FORMULA AUDIO FILE EMAIL URL` ·
`NodeType`: `AI EMAIL` (both lowercase on the wire). Scoped pks are a recorded
deviation from the uuid rule (docs/plans/005-spreadsheet-backend.md): they make
the wire ids predictable (`row.0`, `col.1`, `cell.0.1`) and a cell write a
single upsert by pk.

Indexes: `unique(spreadsheetId, index)` on Column/Row,
`(spreadsheetId, sortOrder)` on Column,
`unique(spreadsheetId, rowIndex, columnIndex)` + `(spreadsheetId, rowIndex)` on
Cell · Relations: all cascade from Spreadsheet · Migrations:
`apps/api/prisma/migrations/`

`sortOrder` is **not** unique on purpose. `reorderColumn` shifts a whole band of
columns in one `updateMany`, and a Postgres unique index is checked per row
mid-statement and cannot be deferred, so the shift would collide with itself.
Density is a service invariant (`spreadsheet-columns.service.ts`), not a
database one — tightening the index would break the reorder.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | the four tables + `ColumnType` + `NodeType` |
| `apps/api/src/modules/spreadsheet/spreadsheet.ids.ts` | ids | scoped/short id builders, `parseCellId` |
| `apps/api/src/modules/spreadsheet/spreadsheet.schema.ts` | schema | zod shapes, wire↔db type case, `cellValueMatchesType`, `isPlainObject` |
| `apps/api/src/modules/spreadsheet/spreadsheet.errors.ts` | errors | the domain errors |
| `apps/api/src/modules/spreadsheet/spreadsheet.shape.ts` | shape | records → wire: `toSheetColumn`, `toSheetCell`, `buildRow` (stored cells, sorted), `buildRowCells` (every column, blanks null — the AI run input) |
| `apps/api/src/modules/spreadsheet/spreadsheet.service.ts` | service | reads + sheet lifecycle, `columnOrThrow`, `columnsOf`, `rowCells` |
| `apps/api/src/modules/spreadsheet/spreadsheet-cells.service.ts` | service | row and cell writes |
| `apps/api/src/modules/spreadsheet/spreadsheet-columns.service.ts` | service | column writes: create, update, reorder, remove — and the `sortOrder` invariant they share |
| `apps/api/src/modules/spreadsheet/spreadsheet-import.parse.ts` | pure | CSV/XLSX bytes → a raw grid of strings |
| `apps/api/src/modules/spreadsheet/spreadsheet-import.infer.ts` | pure | grid → columns with inferred types and coerced values |
| `apps/api/src/modules/spreadsheet/spreadsheet-import.service.ts` | service | parses an upload and replaces the whole grid in one transaction |
| `apps/api/src/modules/spreadsheet/spreadsheet.controller.ts` | controller | the REST routes (table in the contract header) |
| `apps/api/src/trpc/routers/spreadsheet.ts` | router | one procedure per row of the table below |
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
| `spreadsheet.createColumn` | mutation | `SpreadsheetColumnsService.createColumn` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.updateColumn` | mutation | `SpreadsheetColumnsService.updateColumn` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.reorderColumn` | mutation | `SpreadsheetColumnsService.reorderColumn` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.removeColumn` | mutation | `SpreadsheetColumnsService.removeColumn` | NOT_FOUND |
| `POST /spreadsheets/:id/import` | REST only | `SpreadsheetImportService.import` | NOT_FOUND, BAD_REQUEST |

Every procedure also exists as a REST route under `/spreadsheets` (same
services, same zod inputs — the controller parses `{ ...body, ...params }`).
Import is REST only: multipart does not belong on the tRPC link, and a
procedure would pull the parsers into `src/trpc/**`, which the dashboard
transpiles.

## Behaviour

- **Lookups live in one place.** `SpreadsheetService.byId`, `columnOrThrow`
  (distinguishes a missing sheet from a missing column) and `columnsOf` (the
  only place column order is decided: `sortOrder`, then `index` as a
  deterministic tie-break) are called by the write services, never
  re-implemented. `rowCells` reads columns and a row's cells in parallel for
  in-process consumers (`run-ai`).
- **Scoped pks make every write one statement.** A cell write is an upsert by
  pk with no prior lookup; the cells service's module-level builders
  (`upsertRow`, `writeCell`, `rowData`, `cellData`) return un-awaited
  `PrismaPromise`s so `setCell`, `updateRow` and `appendRow` batch them in one
  `$transaction([...])`. Validation (`assertWritable`: sheet exists, every
  entry fits its column's type via `cellValueMatchesType`) runs before any
  write, so a refused batch writes nothing.
- **`appendRow` retries the index race.** It reads `max(index) + 1`, creates
  row + cells in one transaction, and on a unique violation re-reads and
  retries (three attempts) before surfacing `SpreadsheetRowExistsError`.
- **`index` is identity, `sortOrder` is position.** Column writes keep
  `sortOrder` dense: `createColumn` appends at `max + 1`, `removeColumn`
  decrements everything to its right, `reorderColumn` shifts the band between
  old and new position by ±1 in one `updateMany`. `index` is append-only and
  its gaps are permanent, so index-derived ids never renumber and
  `Cell.columnIndex` never moves.
- **`updateColumn` enforces prompt-requires-node on the effective pair**
  (stored + incoming); `createColumn` gets it from the zod `.refine`. Neither
  converts stored cells on a type change.
- **Import is the only full-grid rebuild.** `replaceAll` deletes every Cell,
  Row and Column and `createMany`s the new grid (chunked for the 65535
  bind-parameter cap) inside one transaction, so a failure leaves the sheet
  untouched. Type inference (`spreadsheet-import.infer.ts`) accepts a type
  only when every coerced value passes the same `cellValueMatchesType` the
  cells service applies, so an imported value can never be one `setCell`
  would refuse.
- Cell values are validated in the service, not the schema: the rule needs
  the column row, which only a service may read.

## Reusable pieces

- `SpreadsheetService.columnsOf` — the single ordering point for columns.
- `SpreadsheetService.rowCells` + `buildRowCells` — "the row as the user sees
  it", one entry per column; `run-ai` builds its input from it.
- `toSheetCell` / `toSheetColumn` / `buildRow` (`spreadsheet.shape.ts`) for
  any other producer of the wire shapes.
- `SpreadsheetImportService.replaceAll` — the only wipe-and-rebuild.
- `isPlainObject` and `cellValueMatchesType` (`spreadsheet.schema.ts`) for
  anything that produces or checks cell values; `parseCellId`
  (`spreadsheet.ids.ts`) for anything holding a scoped cell id.
- `src/common/multipart.ts` + `src/common/upload.ts` for any REST upload.

## Used by

- `/ai-spreadsheet` ([route doc](../routes/ai-spreadsheet.md)) — `rows` for the
  active workspace's sheet on load; `setCell`, `createColumn`, `updateColumn`,
  `reorderColumn`, `removeColumn`, `removeRows` from the grid; `POST
  /spreadsheets/:id/import`.
- [`run-ai`](run-ai.md) — `columnOrThrow` + `rowCells` to build a run's
  input; `setCell` (through `complete`) to write its output.
- `workspace.create`/`rename` write sheets directly inside their transactions
  ([workspace.md](workspace.md)).
- `/form/[spreadsheetId]` ([route doc](../routes/form.md)) — `rows` (limit 1,
  for name + columns) on load; `appendRow` on submit.
