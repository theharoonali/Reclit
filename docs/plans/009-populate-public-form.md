# 009 — Populate page + public form

**Status:** implemented
**Scope:** full feature

## Goal

Anyone with the link can open `/form/<spreadsheetId>` — a public, chrome-less
page — and submit a new row to that spreadsheet through a form with one typed
field per column. The dashboard gets a `/populate` page that surfaces the link
(hardcoded to one sheet for now) and an API placeholder card.

## Backend (Agent 1)

- **Table(s):** none — the existing `Row`/`Cell` models carry the data.
- **Procedures:** `spreadsheet.appendRow` — mutation,
  `{ id; cells: { columnIndex; value }[] (min 1) }` → `SheetRow`;
  NOT_FOUND, BAD_REQUEST (type mismatch), CONFLICT (append race retries
  exhausted). REST twin `POST /spreadsheets/:id/rows/append` (201).
- **Service methods:** `SpreadsheetCellsService.appendRow` — validates every
  value against its column type, then writes row + non-null cells at one past
  the highest stored index in one transaction, retrying the index race up to
  3 times. `assertCellsFit` extracted from `updateRow` and shared.
- Reused: `cellValueSchema`, `cellValueMatchesType`, `idInput`, existing
  domain errors, `isUniqueViolation`.

## Frontend (Agent 2)

- **Route(s):** `/populate` (static, `(app)` group, nav entry "Populate");
  `/form/[spreadsheetId]` (`force-dynamic`, new `(public)` route group with a
  chrome-less layout + "Powered by Reclit" footer).
- **Components:** new `populate/populate-panel.tsx` (link card + API card),
  `public-form/public-form-panel.tsx` (data + submit flow),
  `public-form/public-form-fields.tsx` (per-type controls),
  `lib/public-form.ts` (pure validation). New `@reclit/ui` primitives:
  `checkbox` (Radix) and `textarea`.
- **States:** loading/error via `LoadingState`/`ErrorState`; NOT_FOUND shows
  "form does not exist" (no redirect); empty-columns state; per-field inline
  errors; success view with reset.

## Integration (Agent 3)

- `PublicFormPanel` queries `spreadsheet.rows` (`limit: 1`) and mutates
  `spreadsheet.appendRow`; uploads go through the existing `uploadFile()` →
  `POST /files`. Nothing to invalidate — the page's only query is
  columns-shaped and the success view replaces the form.

## Decisions

- New `appendRow` procedure over client-side `createRow` + `updateRow`: one
  transaction, no orphan rows, the index race handled server-side.
- Columns fetched via `spreadsheet.rows` with `limit: 1` — a columns-only
  procedure was not worth schema + service + router + contract + doc rows.
- All fields optional (submit needs ≥1 filled); unchecked boolean is omitted,
  not `false` — an optional checkbox cannot distinguish "no" from "no answer".
- `formula` columns are skipped entirely — storage-only, nothing evaluates
  them.
- Date fields use the native `<input type="date">` — no popover primitive
  exists and `Calendar` is too heavy per field.
- The Populate link's sheet id is hardcoded in `src/config/populate.ts` until
  multi-sheet routing exists (user's call).

## Risks / open questions

- The whole API is authless, so the form endpoint is no *new* exposure — but
  the same visitor can also call `spreadsheet.remove`. Real auth
  (docs/SECURITY.md) is the fix, not form-level guards.
- The hardcoded sheet id must exist in the target database; the page 404s
  (error state) otherwise.

---

## Outcome

- **Shipped:** everything above — `appendRow`
  (`apps/api/src/modules/spreadsheet/spreadsheet-cells.service.ts`), router +
  controller twins, contract tests, `(public)` route group with
  `/form/[spreadsheetId]`, `/populate` page + nav entry, `@reclit/ui`
  `checkbox`/`textarea`.
- **Deviated:** nothing material.
- **Not done:** the API card is a placeholder; per-sheet link discovery waits
  on multi-sheet routing; no rate limiting on the public endpoint.
- **Docs updated:** `docs/features/spreadsheet.md`, `docs/routes/populate.md`,
  `docs/routes/form.md`, `docs/routes/index.md`, contract test header.
