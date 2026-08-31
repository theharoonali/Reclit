# 005 — Spreadsheet Backend

**Status:** implemented
**Scope:** backend + frontend integration

## Goal

Persist the AI spreadsheet. Prisma models (`Spreadsheet`, `Column`, `Row`,
`Cell`), one service pair owning all DB access, a REST controller with
predictable paths (`GET/PATCH /spreadsheets/:id/cells/:rowIndex/:columnIndex`,
…) plus a tRPC router over the same operations, a stateless `POST /files`
upload into the public Supabase bucket `reclit` for audio cells, and the
dashboard wired to fetch, edit, and persist through it.

## Backend (Agent 1)

- `modules/spreadsheet/` — ids, errors, schema, shape assembly, read service,
  write service, REST controller; `trpc/routers/spreadsheet.ts`.
- `modules/file/` — Supabase Storage pass-through (`POST /files`, multipart).
- Second feature, so the shared pieces got extracted per BACKEND.md:
  `common/errors.ts` (`DomainError`), `common/schema.ts`
  (`idInput`/`paginationInput`), `mapDomainError` in `trpc/init.ts`,
  `common/domain-error.filter.ts` for REST; `note` refactored onto them.
- Seed: `prisma/seed.ts` recreates the sample "Customers" sheet via the
  services.

## Frontend (Agent 3)

- `voice` column type renamed `audio` end to end.
- Wire shapes in `lib/ai-spreadsheet/types.ts` become type aliases of
  `RouterOutputs["spreadsheet"]["rows"]`; rows are nested
  (`{ id, index, columns: [{ id, name, value }] }`), no positional `data`.
- `ai-spreadsheet-loader.tsx` fetches the newest sheet's first page;
  `use-sheet-sync.ts` persists cell/column edits without re-rendering the grid.
- Audio side panel (`ai-spreadsheet-audio-editor.tsx`) uploads via
  `POST /files` and stores the public URL in the cell.

## Decisions

- **Scoped, index-derived primary keys** (`<sheetId>.row.0`, `<sheetId>.col.1`,
  `<sheetId>.cell.0.1`), deviating from the uuid-pk rule. Chosen by the user:
  the wire ids `row.0` / `col.1` / `cell.0.1` are predictable, and a cell write
  is one `upsert` by pk with no prior lookup.
- **Rows are sparse and row delete is a clear.** Row indexes are absolute grid
  positions, not ordinals; deleting row N never shifts later rows, so ids never
  renumber.
- **Columns are append-only; only the last column can be deleted** (409
  otherwise). An interior delete would force a mass pk rewrite of columns and
  cells.
- **Type-vs-value checks live in the service**, not zod: they depend on the
  column row, which only the service may read. `cellValueMatchesType` is a pure
  predicate in the schema file.
- **No query invalidation after cell mutations.** A refetch produces a new
  payload prop, which re-normalizes the model and remounts (blanks) the canvas.
  After an edit the mutated model ref is already the truth.
- **Mistyped cell text stays local.** The grid paints it as invalid and the
  sync hook never sends it, so the server never sees a value it would reject.
- **Pagination is served, not consumed.** `rows` returns the
  `startRow`/`limit`/`hasMore`/`nextCursor` envelope; the dashboard fetches the
  first page only, and unfetched rows already render blank.
- **Upload is REST-only multipart** (multer, memory storage, 25 MB). Base64
  over tRPC would inflate payloads ~33% for no benefit.
- **Contract test exceeds the 250-line cap** — its single responsibility is
  the contract, and the surface is 15 procedures plus the REST routes.
- `common/domain-error.filter.ts` imports `@nestjs/common`; it is imported
  from `bootstrap.ts` only, never from `src/trpc/**` or module schema/service
  files.

## Outcome

Implemented as planned.
