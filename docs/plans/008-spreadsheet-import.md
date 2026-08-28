# 008 — Spreadsheet import (CSV/XLSX)

**Status:** implemented
**Scope:** full feature (chrome cleanup + backend + frontend)

## Goal

An **Import** button in the app header on `/ai-spreadsheet` takes a CSV or Excel
file, and the sheet comes back looking exactly like that file: a column per
header cell with its type inferred from the data, and a row per data row. Plus:
the notification bell and profile avatar leave the header on every page.

No Prisma schema change and no migration — import writes only existing tables.

## Backend

- **Endpoint:** `POST /spreadsheets/:id/import` — multipart, field `"file"`,
  `.csv` or `.xlsx`, ≤ 25 MB. Returns **200** (it creates no new resource).
  Response `SheetImportResult = { id, name, totalRows, totalColumns, rowCount,
  cellCount, columns }`. REST only, no tRPC procedure.
- **New files:** `spreadsheet-import.parse.ts` (bytes → a raw grid of strings),
  `spreadsheet-import.infer.ts` (grid → typed, coerced columns — pure),
  `spreadsheet-import.service.ts` (`import` + `replaceAll`),
  `common/multipart.ts` (`MulterFile`/`MAX_UPLOAD_BYTES`, extracted from the
  file feature at the second consumer).
- **Errors:** five new `bad_request` classes — `SPREADSHEET_IMPORT_*` for
  `UNSUPPORTED_TYPE`, `EMPTY`, `NO_HEADER`, `UNREADABLE`, `TOO_LARGE`.
- **Deps:** `papaparse` + `@types/papaparse`, `exceljs`.

## Frontend

- `components/layout/header-actions.tsx` — a context + portal so a page can put
  controls in the global header. `AppShell` provides it, `AppHeader` renders the
  outlet.
- `ai-spreadsheet-import-button.tsx` portals the Import control into the header;
  `use-sheet-import.ts` owns the upload and the refresh sequence.
- `lib/api-fetch.ts` — `API_BASE_URL`, `ApiError` (carries the API's `code`),
  and `postFile`, extracted from `upload-file.ts` at the second consumer.
- `packages/ui/src/components/select.tsx` — the shared Select.
- Header: bell and avatar removed, `PLACEHOLDER_USER` deleted, the sidebar's
  hand-rolled toggle now uses the shared `Button`.

## Decisions

- **`totalRows` is not changed by an import.** It is the sheet's virtual grid
  height (5,000,000 → the `MAX_SPACER_PX` scroll model), not a row count;
  setting it to the file's length would stop the user typing past the last
  imported row. `rowCount` in the response carries the file's length instead.
  This also keeps `use-sheet-viewport`'s `rowExtent` — set in a `useRef`
  initializer with no effect watching `rowCount` — from ever going stale.
- **Full replace in one `$transaction`** of `deleteMany` + chunked
  `createMany`, not a loop over `removeColumn`: that method permits deleting the
  last column only, and a loop would leave a half-wiped sheet on failure. The
  deterministic scoped ids make every pk computable up front, so `createMany`
  needs no lookups. Chunked at 2,000 for Postgres's 65535 bind-parameter limit;
  the array form is sequential inside one transaction, so atomicity holds.
- **Its own service.** `spreadsheet-cells.service.ts` was already at the
  250-line cap, and `replaceAll` is the one grid write that is neither
  per-cell, per-row nor per-column.
- **REST only, no tRPC procedure** — multipart does not belong on the tRPC link
  (the file feature's recorded reason), and a procedure would pull `exceljs` and
  `papaparse` into `src/trpc/**`, the graph the dashboard transpiles.
- **Inference reuses `cellValueMatchesType`.** Each candidate type has a coercer
  and is accepted only if the existing predicate also passes on the coerced
  value, so `URL_RE`/`EMAIL_RE` stay private to the schema and an imported value
  can never be one `setCell` would reject.
- **Three inference guards, each found by a failing test or a real file:**
  only `true`/`false`/`yes`/`no` infer boolean (never `1`/`0`, which turned
  numeric flag columns into booleans); a leading zero is never a number ("007"
  is a ZIP code); and a bare number is never a date (`Date.parse("007")`
  succeeds as year 7, which made a ZIP column a date column). All three are
  unrecoverable if wrong, because `updateColumn` does not convert stored cells.
- **A single-column CSV is valid.** Papa reports "cannot auto-detect delimiter"
  for it; treating that as fatal rejected legitimate files, so no Papa error is
  fatal now — an unusable file is caught by the blank-input check or surfaces as
  an empty grid.
- **The extension decides the format**, not the declared MIME type: browsers
  mislabel `.csv` routinely, and a `notes.txt` sent as `text/csv` should still
  be rejected. MIME is consulted only when there is no extension at all.
- **The Import button lives in the header, portalled**, rather than in a toolbar
  row of its own. The sheet keeps its whole content area, the header keeps
  knowing nothing about any feature, and the component that owns the import
  state keeps owning it — only the DOM moves.
- **The shared `Select` wraps a native `<select>`.** Radix Select portals and
  traps focus, which fights the grid's hidden-textarea focus proxy. Native has
  no portal and no focus trap, and brings keyboard, type-ahead and
  screen-reader semantics — and the mobile picker — for free.
- **`useSheetSync` gains `discardPending()` and a generation guard.** An import
  replaces the model, so a debounced write landing afterwards would find its key
  gone and blank a freshly imported cell; and a request already in flight would
  restore a *pre*-import snapshot into a *post*-import model on error. The
  "mutations do not invalidate `spreadsheet.rows`" rule gains one recorded
  exception: import.
- **`invalidateQueries`, never `resetQueries`.** Invalidation leaves the query
  `success`, so the loader never falls back to `LoadingState` and the grid
  re-renders instead of remounting — a remounted canvas is a blank one.

## Risks / open questions

- `exceljs` under Bun was unverified; gated with a scratch script before any
  XLSX code was written. It passed — workbooks round-trip, `Date` cells included.
- `Date.parse` is permissive; the shape guard plus the every-value rule contain
  it. The demote-to-string test pins the behaviour.
- The missing-`"file"` 400 is Nest's own exception and carries no `code`, so the
  button shows the generic message. Documented, not fixed.

---

## Outcome

- **Shipped:** all of the above. The header carries Import on `/ai-spreadsheet`
  and nothing else but search; `packages/ui` gained `select`.
- **Deviated:** the Import control was first built as a toolbar row inside the
  grid (`grid-rows-[auto_auto_minmax(0,1fr)]`) and moved to the header on
  request, which is the better answer — it needed the portal, and the portal is
  now the documented way any page puts a control in the chrome.
- **Follow-up found in review:** the loader only ever fetched the first page of
  `spreadsheet.rows` (the API's `limit` defaults to 100), so a 1,000-row import
  stored all 1,000 rows but painted 100. `lib/ai-spreadsheet/fetch-all-rows.ts`
  now walks every page and merges them into one payload — one normalise, one
  repaint — registered under tRPC's own `rows` query key so the import
  invalidation still matches. `parseShortRowId`/`parseShortColumnId` moved to
  `lib/ai-spreadsheet/short-ids.ts` at the second consumer.
- **Not done:** `ai-spreadsheet-grid.tsx` is still over the 150-line component
  cap (pre-existing). The split worth making is the panel-content block, and it
  must preserve the JSX tree shape so the panel's exit animation survives.
- **Docs updated:** `docs/features/spreadsheet.md`,
  `docs/routes/ai-spreadsheet.md`, `docs/routes/root.md`,
  `docs/rules/FRONTEND.md` (two new rules: never hand-roll a form control, and
  page controls belong in the header).
