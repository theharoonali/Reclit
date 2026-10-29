# 041 — Sheet design: auto heights, fitted widths, cell dialog, clipboard

## Goal

Four UX changes to the canvas sheet: rows grow with wrapped text (cap 10
lines, the editor scrolls in-cell past it), columns auto-fit content between
a min and max width, JSON and Mail cells open a modal key/value table on
double-click (view **and** edit — relaxing 040's server-side read-only rule;
inline edits stay blocked), and Excel-style Ctrl+C/X/V over cell ranges
(simple cut: copy + clear).

## Plan

- New `lib/ai-spreadsheet/layout.ts`: `SheetLayout` (column offsets + sparse
  tall rows with prefix sums), `wrapRanges`/`wrapLines`/`caretPosition`,
  `buildLayout` from the model (every stored row is client-side). The layout
  rides `Viewport`; geometry.ts re-exports the base constants and takes the
  layout; all painters/hooks convert (`rowTop`/`rowAt`/`colLeft`/`colAt`).
  Rebuilds happen at paint time when marked dirty (cell writes, column or
  font changes), never per frame.
- Multiline editor: buffer may hold `\n` (Alt+Enter), `paint-editor` wraps
  with the same `wrapRanges`, `innerScrollY` keeps the caret inside the
  10-line window.
- `ai-spreadsheet-cell-dialog.tsx` (Dialog + Table, draft + Save/Cancel)
  replaces the JSON side-panel editor; Mail cells open it too. Backend:
  `SPREADSHEET_COLUMN_READ_ONLY` and `setCell`'s `computed` option removed.
- Clipboard: pure `clipboard.ts` (TSV, Excel quoting, stored-row clamp, 5k
  cap) + `use-sheet-clipboard.ts` on the proxy textarea's clipboard events;
  paste writes one `spreadsheet.updateCells` batch (`use-sheet-sync.setCells`
  with grouped rollback). `updateCells` exposed as a tRPC procedure.

## Outcome

Shipped as planned. Dashboard tests 276 (new `layout.test.ts`,
`clipboard.test.ts`; geometry/paint tests converted); spreadsheet contract
83 with the `updateCells` rows and the read-only tests replaced by a
Mail-cells-accept-writes test. The old `ai-spreadsheet-json-editor.tsx` is
deleted. Widths/heights stay client-derived (nothing persisted); drag-resize
and multi-area copy remain out of scope.
