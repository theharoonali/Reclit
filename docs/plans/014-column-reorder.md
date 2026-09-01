# 014 — Column drag-and-drop reordering

**Status:** implemented
**Scope:** full feature

## Goal

A user can grab a grip on a column header in `/ai-spreadsheet`, drag the column
horizontally while the grid previews where it will land, and drop it in a new
position that survives a reload. No column id, cell id or cell value moves.

## Backend (Agent 1)

- **Table:** `Column` gains `sortOrder Int` plus `@@index([spreadsheetId, sortOrder])`.
  `index` is untouched — it is identity, not position.
- **Procedures:** `spreadsheet.reorderColumn`, mutation,
  `{ id; columnIndex; newSortOrder: 0..n-1 }` → `SheetColumn[]` (the whole
  order) → `NOT_FOUND`, `BAD_REQUEST`. REST twin
  `POST /spreadsheets/:id/columns/:c/reorder`, 200.
- **Service methods:** new `spreadsheet-columns.service.ts` holding
  `createColumn`, `updateColumn`, `reorderColumn`, `removeColumn` — every write
  that has to maintain the `sortOrder` invariant, in one place.
  `reorderColumn` is one `updateMany` (the ±1 band shift) plus one `update`, in
  a transaction.
- Reused rather than written: `spreadsheetService.columnOrThrow` for the
  sheet-vs-column 404 distinction, `columnsOf` for the returned order,
  `columnRefInput`/`gridIndex` for the input, `DomainError` for the new error.

## Frontend (Agent 2)

- **Route:** `/ai-spreadsheet`, unchanged.
- **Components:** extended — `geometry.ts` (`headerGripRect`, `dropSlotAt`,
  `isHeaderColumnHit`, a `header-grip` hit), `paint-header.ts` (grip glyph,
  empty landing well), `paint-body.ts` (preview order, empty well),
  `use-sheet-pointer.ts` (cursor, grip hover), `use-sheet-canvas.ts`,
  `use-sheet-scroll.ts` (`scrollBy`), `use-sheet-model.ts`
  (`applyColumnOrder`, sort by `sortOrder`), `ai-spreadsheet-header.tsx`
  (`touch-none`, pointer up/cancel, the tooltip anchor). New —
  `lib/ai-spreadsheet/column-order.ts`, `use-column-drag.ts`,
  `use-column-reorder.ts`, `ai-spreadsheet-drag-chip.tsx`, and the shared
  `packages/ui/src/components/tooltip.tsx` (shadcn on
  `@radix-ui/react-tooltip`).
- **States:** no new tokens — the well is `palette.ring` at low alpha, the grip
  `palette.mutedText`, the chip and tooltip the `popover` tokens. One new
  message key, `aiSpreadsheet.column.reorder` ("Drag and drop").

## Integration (Agent 3)

`use-column-drag` → `use-column-reorder` → `spreadsheet.reorderColumn`. Nothing
is invalidated: the mutation's response is written into the model ref and the
grid re-renders through `columnsVersion`, the same recorded deviation the rest
of the sheet uses (a refetch would remount and blank the canvas).

The in-flight preview (`previewOrder`) is paint state only and never touches the
model, so the frontend still never decides the persisted order — it sends one
column and one position and adopts what comes back.

## Decisions

- **A new `sortOrder` field, not renumbering `index`.** `index` is the column pk
  suffix, the wire id, and the address of every cell — and `Cell` has no fk to
  `Column`, so a renumber would silently mis-address every value. Rejected:
  rewriting Column and Cell pks on every move.
- **`sortOrder` stays dense `0..n-1`.** The ±1 shift depends on contiguity, and
  it makes `newSortOrder` mean "visual position". Cost: `removeColumn` now
  compacts, which is the one behaviour change to an existing procedure.
  Rejected: letting it go gappy like `index`.
- **No unique constraint on `sortOrder`.** A Postgres unique index is checked
  per row mid-`UPDATE` and cannot be deferred, so the band shift would collide
  with itself. Rejected: parking the band at an offset and shifting it back.
- **Out-of-range `newSortOrder` is `BAD_REQUEST`, not clamped.** Out of range
  means the caller's view of the order is stale, and clamping hides that.
- **Movement threshold (4px), not a hold timer.** A timer means a dead period
  where the user has pressed and nothing has happened.
- **Optimistic, then reconcile.** Waiting for the round trip means the grid
  snaps back to the pre-drop order until the response lands and then jumps
  forward — a visible glitch on every drop. The columns now move on release and
  the request follows; the response is still applied, but only where it
  disagrees with what is on screen, so agreement costs no second render. A
  failure restores the pre-drop snapshot. A reorder can afford this where a
  delete cannot: it destroys nothing, and the local move is the same arithmetic
  the server redoes. Rejected: pessimistic apply-the-response, which was the
  first cut.
- **Pointer capture, not window listeners.** The pointer leaves the 36px header
  strip on the first move; capture keeps events flowing with nothing to leak.
- **The cursor is left alone.** A first cut set `grab`/`grabbing` on the header
  and then, when that turned out to revert to an arrow the moment the drag left
  the strip, claimed the cursor app-wide with a `data-dragging` rule. Both were
  dropped on review: the drag is already legible from the chip riding the
  pointer and the columns parting, and overriding the pointer the user's system
  gives them buys nothing for it.
- **A live preview, not an insertion line.** The first cut drew a 2px orange
  line at the drop boundary; it read as dated. The columns now part around a
  tinted well and the dragged column rides the pointer on a card, which shows
  the same information as the result rather than as an annotation. Rejected:
  keeping the line alongside the preview — two indicators for one fact.
- **The chip hides by toggling the `hidden` class, not the attribute.** Its
  `.flex` out-specifies the user-agent's `[hidden] { display: none }`, so the
  attribute alone leaves it permanently visible. Caught in the browser, not by
  types.
- **The column writes moved to their own service.** `spreadsheet-cells.service.ts`
  was 345 lines, already past the ~250 cap, and reorder is a cross-column write
  — the same reason import got its own file.

## Risks / open questions

- `createColumn` reads `max(sortOrder) + 1` without a retry, so two concurrent
  creates on one sheet can land on the same `sortOrder`. Pre-existing for
  `index` too (which at least has a unique constraint to fail on); the app has
  one user and no auth. Would be settled by the same retry loop `appendRow` uses.
- The grip has no keyboard equivalent, so reordering is pointer-only. Consistent
  with the rest of the canvas grid, and recorded in the route doc's
  Accessibility bullet, but it is a real gap.

---

## Outcome

- **Shipped:** the migration `20260901000000_add_column_sort_order` (nullable
  add → dense `ROW_NUMBER()` backfill → `SET NOT NULL` → index),
  `apps/api/src/modules/spreadsheet/spreadsheet-columns.service.ts`,
  `spreadsheet.reorderColumn` + its REST twin, and on the dashboard
  `lib/ai-spreadsheet/column-order.ts`,
  `components/ai-spreadsheet/use-column-drag.ts`, `use-column-reorder.ts` and
  `ai-spreadsheet-drag-chip.tsx`, plus `@reclit/ui/tooltip`, with the geometry,
  painters, pointer routing, scroll and model changes listed above.
- **Deviated:** the plan put only `reorderColumn` in the new service; all four
  column writes moved, which took `spreadsheet-cells.service.ts` from 345 lines
  back to 245 and put the invariant's writers together. `buildRow` also now
  orders a row's entries by the column's display rank rather than by
  `columnIndex`, so the row payload and the header agree. The planned orange
  drop line shipped first and was then replaced, on review, by the live preview
  + pointer chip + tooltip described under Decisions, and the
  planned pessimistic apply-the-response became optimistic-then-reconcile for
  the same reason: both were visible glitches rather than design choices.
- **Not done:** a keyboard path to reordering; the `createColumn` race above.
  There is no failure toast when a reorder is rejected — the column springs
  back silently, matching the rest of the sheet, which has no toast system yet.
- **Docs updated:** [features/spreadsheet.md](../features/spreadsheet.md),
  [routes/ai-spreadsheet.md](../routes/ai-spreadsheet.md),
  [routes/form.md](../routes/form.md) (field order follows `sortOrder`), and the
  contract header + a `spreadsheet.reorderColumn` describe in
  `apps/api/src/__tests__/spreadsheet.api.test.ts`.
