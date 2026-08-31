# 010 — Row selection & batch delete

**Status:** implemented
**Scope:** full feature

## Goal

The user can tick rows in the sheet's row-number gutter — each row gets a
checkbox, and the header's corner block gets a select-all twin — and delete
every ticked row from the database in one action. A ticked checkbox shows a
mini primary-coloured box inside the square rather than a check glyph.

## Backend (Agent 1)

- **Table(s):** none — existing `Row`/`Cell`.
- **Procedures:** `spreadsheet.removeRows` — mutation,
  `{ id; rowIndexes: number[] (1..10_000) }` → `{ ids: string[] }`;
  NOT_FOUND (sheet), BAD_REQUEST (empty/oversized list). REST twin
  `POST /spreadsheets/:id/rows/remove` (200).
- **Service methods:** `SpreadsheetCellsService.removeRows` — `removeRow` for
  a batch: cells + rows deleted in one transaction, duplicates collapsed,
  never-stored indexes are no-ops, absolute positions never shift.
- Reused: `idInput`, `gridIndex`, `shortRowId`, existing errors.

## Frontend (Agent 2)

- **Route(s):** none new — `/ai-spreadsheet`.
- **Components:** checkboxes are *painted* (the grid is canvas): new pure
  painter `lib/ai-spreadsheet/paint-checkbox.ts` used by `paint-body` (one per
  gutter row) and `paint-header` (select-all in the corner block); geometry
  grew `GUTTER_WIDTH` 48→76 and gained checkbox rects + an inflate helper for
  hit zones. New `use-sheet-selection.ts` (tick set in a ref, count as state,
  select-all, delete mutation) and `ai-spreadsheet-selection-bar.tsx`
  (count + destructive Delete `Button`, portalled into the app header like
  Import).
- **States:** bar hidden at zero ticks; "Deleting…" while the mutation runs;
  inline `role="alert"` failure with the selection kept.

## Integration (Agent 3)

- Delete calls `spreadsheet.removeRows`, then removes the rows from the local
  model and repaints — no `spreadsheet.rows` invalidation (the sheet's
  recorded deviation; a refetch would remount and blank the canvas). Pending
  debounced cell writes are discarded first (`discardPending`) and any active
  edit cancelled, so neither can re-create a deleted cell.

## Decisions

- Painted checkboxes, not DOM overlays: the gutter is canvas; overlaying DOM
  checkboxes would need scroll-synced absolute positioning for no gain. The
  visual follows the requested design (square outline, mini primary box when
  ticked); the shadcn piece is the header's `Button`.
- Batch `removeRows` over N `removeRow` calls: select-all can cover thousands
  of rows; one transaction, one round trip.
- Select-all targets **stored** rows (the model's `rowIds` ∪ rows with cells)
  — ticking 5,000,000 virtual blanks would be meaningless; deleting a blank
  row is a server-side no-op anyway.
- Partial selection paints the header's mini box at reduced alpha.
- No confirm dialog: no dialog primitive exists yet and the header button is
  explicit and destructive-styled; add one if a dialog primitive lands.

## Risks / open questions

- Rows go blank in place (absolute indexes never shift) — users may expect
  compaction. That is the sheet's documented semantics (`removeRow` behaves
  the same).

---

## Outcome

- **Shipped:** everything above. Key files:
  `apps/api/src/modules/spreadsheet/spreadsheet-cells.service.ts`,
  `apps/dashboard/src/lib/ai-spreadsheet/paint-checkbox.ts`,
  `apps/dashboard/src/components/ai-spreadsheet/use-sheet-selection.ts`,
  `ai-spreadsheet-selection-bar.tsx`.
- **Deviated:** nothing material.
- **Not done:** confirm dialog before delete; shift-click range selection.
- **Docs updated:** `docs/features/spreadsheet.md`,
  `docs/routes/ai-spreadsheet.md`, contract test header.
