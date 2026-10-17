# 031 — Sheet row selection, drag selection and the island's confirm colours

**Status:** implemented
**Scope:** frontend

## Goal

On `/ai-spreadsheet` the row-number gutter carries no checkboxes. Clicking a
row number selects the whole row as the cell selection (shift-click or a drag
down the numbers extends it to more rows); the header's corner checkbox selects
every row that holds data and clears again on a second click. A press-and-drag
across cells selects a rectangle, autoscrolling at the edges; shift-click picks
single cells (or rows) as further areas of one selection. Delete rows, cell
Delete and Run AI all read that one selection; Run AI stays visible while the
selected AI cells are working, disabled and reading "Working...". In the
assistant island a pending delete asks with a green check on a light-green
circle and a red cross on a light-red one.

## Backend (Agent 1)

None. `spreadsheet.removeRows` and `runAi.runCells` are unchanged.

## Frontend (Agent 2)

- **Route(s):** `/ai-spreadsheet` (and the island, on both pages); no nav change.
- **Components:**
  - New pure `lib/ai-spreadsheet/row-selection.ts`: `rowRangeAddresses`,
    `selectedRowRange`, `storedRows`, `storedRowBounds`, `storedRowsIn`,
    `selectAllState`.
  - `geometry.ts`: `GUTTER_WIDTH` 56 → 48; `gutterCheckboxRect` and
    `CHECKBOX_PAD_X` removed; `headerCheckboxRect` centred; `AUTOSCROLL_EDGE`
    / `AUTOSCROLL_STEP` exported (shared by the column drag and the range drag).
  - `paint-body.ts`: no gutter checkboxes, centred numbers, the selection's
    rows tinted.
  - `use-cell-editor.ts`: `selectRange(anchor, active, areas)`,
    `toggleArea(anchor, active)` and `clearSelection()`; `selectCell` /
    `extendTo` call `selectRange`; `cancel` keeps the anchor and the areas.
    `EditorState.areas` holds the earlier areas of a multi-area selection;
    `run-targets.ts` gains `selectionRects` and `planRunBatches` (one
    `runCells` call per group of rows sharing a column set).
  - New `use-sheet-drag-select.ts` (`createRangeDragHandlers`): pointer
    capture, cells / rows mode, rAF edge autoscroll.
  - `use-sheet-pointer.ts`: a gutter press selects the row (shift extends),
    the header corner toggles select-all, a body press arms the range drag;
    body pointer move / up / cancel.
  - `ai-spreadsheet-body.tsx`: the three new pointer props.
  - `use-sheet-canvas.ts`: wires the range drag; `selectAll` derived from the
    editor.
  - `use-sheet-selection.ts`: derives the whole-row selection from the editor
    and owns Delete rows.
  - `use-run-cells.ts` exposes `busyCount`; `ai-spreadsheet-grid.tsx` publishes
    the pill while `count > 0`, busy while a target works (`listen.working`).
  - `@reclit/ui/button`: variants `island-success`, `island-destructive`;
    `assistant-confirm.tsx` uses them.
- **States:** no selection → no row controls; whole-row selection → "N rows
  selected" + Delete rows; an AI cell in the selection → Run AI; a working
  target → "Working..." disabled; Delete rows over only blank rows sends
  nothing.

## Integration (Agent 3)

- Delete rows → `spreadsheet.removeRows` with the stored rows inside the
  selected range; on success the rows blank locally and the selection clears
  (no `spreadsheet.rows` invalidation — the sheet's recorded deviation).
- Run AI unchanged: `runAi.runCells` over the rectangle's rows × runnable
  columns.

## Decisions

- Decided with the user: a row selection **is** a whole-row cell range
  (Excel's model), not a separate tick set — one selection feeds Delete rows,
  cell Delete and Run AI. Rejected: keeping ticks beside the rectangle, which
  needed a second rule for what Run AI runs.
- Decided with the user: Run AI stays visible while the selected AI cells are
  working, disabled and labelled "Working..."; it was hidden before.
- Decided with the user (follow-up): shift-click **picks** a single cell or
  row as a new area rather than extending the range — the selection is the
  union of its areas; drag and shift+arrows extend the current area;
  shift-clicking an area that is exactly that cell unpicks it. Run AI plans
  the union once: rows grouped by their set of selected AI columns, one
  `runCells` call per group, so a rectangle stays one call, every cell is
  sent once and a row's AI columns stay a series. Size is judged before
  enumerating (rows = the union of spans, cells = the per-area sum, overlaps
  counted twice). Rejected: Ctrl/Cmd for picking, which the user did not ask
  for, and one call per area, which would send an overlapped cell twice.
- The whole-row addresses put `active` at column 0 (typing edits the first
  cell, the ring sits at the left) and `anchor` at the last column.
- Select-all covers `storedRowBounds` (first..last stored row) rather than
  only the stored rows: a rectangle cannot express a sparse set; Delete rows
  still sends only the stored rows inside it.
- Drag selection is a sibling of the column drag (`createColumnDragHandlers`):
  a closure over refs with pointer capture and a rAF autoscroll, never React
  state. The drag in flight lives in a ref (`RangeDragState`), not a closure
  variable: every selection change re-renders the grid and rebuilds the
  handlers mid-drag, and the first version lost the drag on exactly that
  render — the last pointer move before release never applied. No
  `touch-none` on the body, so a touch pan still scrolls (`pointercancel`
  ends the drag).
- A press on a capsule chip (JSON / file / audio) acts as before and does not
  arm a drag.
- `editor.cancel()` keeps the anchor: the cancel that runs before Delete rows
  must not collapse the row selection it is deleting.
- `bg-success/10 text-success` (the `public-form-success` precedent) and its
  destructive twin as `cva` variants, not call-site classes.

## Risks / open questions

- `selectAllState` walks the model's cell keys on every paint while a
  whole-row selection exists; fine at the import cap (20,000 rows), revisit if
  it shows in profiles.
- Delete rows sends every stored row in the range in one `removeRows` call;
  the API caps the list at 10,000 (unchanged from the old select-all).
- A whole-row selection over blank rows shows "N rows selected" for rows the
  server never stored; Delete rows then sends nothing.

---

## Outcome

- **Shipped:** everything above. New `lib/ai-spreadsheet/row-selection.ts`
  and `components/ai-spreadsheet/use-sheet-drag-select.ts`; `geometry.ts`
  (`GUTTER_WIDTH` 48, centred `headerCheckboxRect`, the shared autoscroll
  constants), `paint-body.ts`, `paint-checkbox.ts`, `types.ts`
  (`RangeDragState`), `use-cell-editor.ts` (`selectRange`, `clearSelection`,
  an anchor-keeping `cancel`), `use-sheet-pointer.ts`,
  `ai-spreadsheet-body.tsx`, `use-sheet-canvas.ts`, `use-sheet-selection.ts`,
  `use-run-cells.ts` (`busyCount`), `ai-spreadsheet-grid.tsx`, `en.json`
  (`listen.working`); `@reclit/ui/button` variants `island-success` /
  `island-destructive`, used by `assistant-confirm.tsx`. Tests:
  `tests/ai-spreadsheet/row-selection.test.ts` (new) and the gutter cases in
  `paint-body.test.ts`.
- **Shipped (follow-up, same stream):** `EditorState.areas` and
  `SelectionRect` in `types.ts`; `selectionRects`, `containsCell` and
  `planRunBatches` (replacing `planRunTargets`) in `run-targets.ts`;
  `toggleArea` in `use-cell-editor.ts` (`selectRange` takes the areas to
  keep, `extendTo` and the row drag keep them, `cancel` keeps them, the
  selection key and cell clearing read every area); shift-click in
  `use-sheet-pointer.ts` picks a cell or row; `paintArea` in `paint-body.ts`
  rings every area; `selectedRowRanges` / `mergeRowRanges` / `rowCountOf` in
  `row-selection.ts` and `use-sheet-selection.ts` over several ranges;
  `use-run-cells.ts` sends one `runCells` call per batch. Tests: the
  `run-targets` file rewritten around batches, `row-selection` and
  `paint-body` cases for areas (223 dashboard tests).
- **Deviated:** the drag's state moved from closure variables into a ref
  after the first browser check (see Decisions): with it in a closure the
  last pointer move before release never applied. `selectAllState` is `none`
  rather than `some` for a whole-row selection on a sheet with nothing stored.
  After the first delivery the user asked for shift-click to pick single
  cells rather than extend the range (see Decisions) — in the browser: three
  shift-picked AI cells read "Run 3 cells", unpicking one "Run 2 cells", row 1
  plus a shift-picked row 3 "2 rows selected" (and "Working…", row 1 having a
  pending run), and a plain drag over three rows collapsed the picks into one
  rectangle ("3 rows selected", "Run 3 cells").
- **Verified:** dashboard and ui lint, typecheck, the 212 dashboard tests; in
  the browser on `/ai-spreadsheet` — no gutter checkboxes and centred numbers;
  a row click → "1 row selected", Delete rows, and the capsule's pill reading
  "Working…" (the sheet's stored rows carried pending runs); shift-click → "3
  rows selected"; a cell drag → "Run 4 cells"; a drag down the row numbers →
  "5 rows selected"; the header checkbox → "2 rows selected", a second click
  clears; a throwaway row removed through Delete rows (`removeRows` 200, the
  selection cleared, no console errors). The two variants resolve in the
  compiled CSS (10% tint, full-strength icon colour, hover rules present).
- **Not verified:** edge autoscroll mid-drag (a synthetic drag cannot hold the
  pointer at an edge); the "Starting…" → "Working…" → "Run AI" cycle of a run
  started here, and the confirmation's colours inside a live island — both
  need the Trigger.dev worker, which the user runs.
- **Not done:** Ctrl/Cmd-click for non-contiguous rows or cells; keyboard row
  selection; a pointer cursor over the gutter.
- **Docs updated:** `docs/routes/ai-spreadsheet.md`, `docs/routes/root.md`,
  `docs/rules/FRONTEND.md`, the `button.tsx` variant table. No contract
  change.
