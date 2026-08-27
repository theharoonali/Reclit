# `spreadsheet`

**Purpose:** persistent storage for the AI spreadsheet — sheets, typed columns,
sparse rows, and JSON-valued cells addressed by predictable index-derived ids.

**Contract:** `apps/api/src/__tests__/spreadsheet.api.test.ts` — payloads,
responses, and error codes live in its header. Do not duplicate them here.

## Tables `Spreadsheet`, `Column`, `Row`, `Cell`

| Column | Type | Notes |
| --- | --- | --- |
| `Spreadsheet.id` | `String` | pk, `@default(uuid())` |
| `Spreadsheet.name` | `String` | required |
| `Spreadsheet.totalRows` | `Int` | default 5,000,000 — the virtual grid height |
| `Column.id` | `String` | pk, scoped `"<sheetId>.col.<index>"` |
| `Column.index` / `name` / `type` | `Int` / `String` / `ColumnType` | unique(spreadsheetId, index) |
| `Row.id` | `String` | pk, scoped `"<sheetId>.row.<index>"`; rows are sparse |
| `Cell.id` | `String` | pk, scoped `"<sheetId>.cell.<row>.<col>"` |
| `Cell.value` | `Json?` | never stored null — clearing deletes the record |
| `createdAt` / `updatedAt` | `DateTime` | on all four models |

`ColumnType`: `STRING NUMBER BOOLEAN DATE JSON FORMULA AUDIO FILE EMAIL URL`
(lowercase on the wire). Scoped pks are a recorded deviation from the uuid rule
(docs/plans/006-spreadsheet-backend.md): they make the wire ids predictable
(`row.0`, `col.1`, `cell.0.1`) and a cell write a single upsert by pk.

Indexes: `unique(spreadsheetId, index)` on Column/Row,
`unique(spreadsheetId, rowIndex, columnIndex)` + `(spreadsheetId, rowIndex)` on
Cell · Relations: all cascade from Spreadsheet · Migrations:
`apps/api/prisma/migrations/`

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | the four tables + `ColumnType` |
| `apps/api/src/modules/spreadsheet/spreadsheet.ids.ts` | schema | scoped/short id compose + parse |
| `apps/api/src/modules/spreadsheet/spreadsheet.schema.ts` | schema | zod shapes, wire↔db type case, `cellValueMatchesType` |
| `apps/api/src/modules/spreadsheet/spreadsheet.errors.ts` | schema | the five domain errors |
| `apps/api/src/modules/spreadsheet/spreadsheet.shape.ts` | schema | records → nested `SheetRow` assembly |
| `apps/api/src/modules/spreadsheet/spreadsheet.service.ts` | service | reads + sheet lifecycle, `columnOrThrow` |
| `apps/api/src/modules/spreadsheet/spreadsheet-cells.service.ts` | service | grid writes (cells, rows, columns) |
| `apps/api/src/modules/spreadsheet/spreadsheet.controller.ts` | controller | the predictable REST paths |
| `apps/api/src/trpc/routers/spreadsheet.ts` | router | the 15 procedures |
| `apps/api/prisma/seed.ts` | — | seeds the sample "Customers" sheet via the services |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `spreadsheet.list` | query | `SpreadsheetService.list` | — |
| `spreadsheet.byId` | query | `SpreadsheetService.byId` | NOT_FOUND |
| `spreadsheet.create` | mutation | `SpreadsheetService.create` | BAD_REQUEST |
| `spreadsheet.remove` | mutation | `SpreadsheetService.remove` | NOT_FOUND |
| `spreadsheet.rows` | query | `SpreadsheetService.rows` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.row` | query | `SpreadsheetService.row` | NOT_FOUND |
| `spreadsheet.column` | query | `SpreadsheetService.column` | NOT_FOUND |
| `spreadsheet.cell` | query | `SpreadsheetService.cell` | NOT_FOUND |
| `spreadsheet.setCell` | mutation | `SpreadsheetCellsService.setCell` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.updateRow` | mutation | `SpreadsheetCellsService.updateRow` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.createRow` | mutation | `SpreadsheetCellsService.createRow` | NOT_FOUND, CONFLICT |
| `spreadsheet.removeRow` | mutation | `SpreadsheetCellsService.removeRow` | NOT_FOUND |
| `spreadsheet.createColumn` | mutation | `SpreadsheetCellsService.createColumn` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.updateColumn` | mutation | `SpreadsheetCellsService.updateColumn` | NOT_FOUND, BAD_REQUEST |
| `spreadsheet.removeColumn` | mutation | `SpreadsheetCellsService.removeColumn` | NOT_FOUND, CONFLICT |

Every operation also exists as a REST route under `/spreadsheets` (same
services, same shapes) — the route table lives in the contract header.

## Behaviour

- Rows are sparse; indexes are absolute grid positions. `removeRow` clears and
  never shifts. Never-written rows/cells read back blank, not 404.
- Columns are append-only (`index` = current count) and only the last column
  can be deleted (CONFLICT otherwise), so index-derived ids never renumber.
- `setCell` validates the value against the column type in the service
  (`cellValueMatchesType`) and upserts row + cell by pk in one transaction;
  `value: null` deletes the cell.
- `updateColumn` changing `type` does not convert or revalidate stored cells.
- `FORMULA` is storage-only; nothing evaluates formulas.
- `rows` pages *stored* rows (`startRow`/`limit`, take limit+1 → `hasMore`,
  `nextCursor`).

## Reusable pieces

- `src/common/schema.ts` `idInput`/`paginationInput`; `src/common/errors.ts`
  `DomainError`; `src/common/prisma-errors.ts`; `mapDomainError` in
  `src/trpc/init.ts`; `DomainErrorFilter` for any future REST controller.

## Used by

- `/ai-spreadsheet` ([route doc](../routes/ai-spreadsheet.md)) — `list`, `rows`
  on load; `setCell`, `createColumn`, `updateColumn` from the grid.
