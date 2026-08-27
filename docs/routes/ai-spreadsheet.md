# `/ai-spreadsheet`

**Purpose:** a spreadsheet rendered on `<canvas>` — endless vertical scroll,
typed columns the user can add, cell editing drawn on the canvas, and JSON
cells edited in a side panel.

**Rendering:** static. The payload is a module constant
(`sample-payload.ts`); nothing is fetched, so there is no `force-dynamic`.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/ai-spreadsheet/page.tsx` | RSC | metadata + full-bleed `h-full` wrapper around the grid |
| `apps/dashboard/src/components/ai-spreadsheet/ai-spreadsheet-grid.tsx` | client | the main component; takes `payload`, owns panel state and the i18n labels |
| `…/ai-spreadsheet-header.tsx` | client | header canvas, click routing, the screen-reader "add column" button |
| `…/ai-spreadsheet-body.tsx` | client | body canvas, scroll container, scroll spacer |
| `…/ai-spreadsheet-input-proxy.tsx` | client | the hidden textarea and the key bindings |
| `…/ai-spreadsheet-side-panel.tsx` | client | the docked panel frame |
| `…/ai-spreadsheet-column-form.tsx` | client | add **and** edit a column (name + type) |
| `…/ai-spreadsheet-json-editor.tsx` | client | key/value table behind a JSON cell |
| `…/use-sheet-canvas.ts` | hook | wires sizing, painting, pointer routing and the editor |
| `…/use-sheet-model.ts` | hook | payload → `SheetModel`; `getCell`/`setCell`/`addColumn`/`updateColumn` |
| `…/use-sheet-viewport.ts` | hook | viewport ref, rAF paint scheduler, palette/font refresh |
| `…/use-sheet-scroll.ts` | hook | virtual↔native scroll mapping, wheel, blank-tail growth |
| `…/use-cell-editor.ts` | hook | the edit state machine |
| `…/sample-payload.ts` | data | the stand-in response |
| `apps/dashboard/src/lib/ai-spreadsheet/*.ts` | pure | types, geometry, palette, formatting, text metrics, four painters |
| `apps/dashboard/src/hooks/use-canvas-surface.ts` | hook | generic DPR-correct canvas sized from another element |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`, `@reclit/ui/cn`,
`.scrollbar-none` and the `duration-smooth`/`ease-smooth` motion pair (both
defined in `packages/ui`), `config/nav.ts`, `components/layout/`.

## APIs called

None. The page calls no tRPC procedure; `payload` is a prop and every edit
lives in memory until the tab is closed.

The payload type in `lib/ai-spreadsheet/types.ts` mirrors the shape the sheet
endpoint is expected to return, including `pagination`. Wiring it up means
replacing `SAMPLE_PAYLOAD` in the page — no component below changes.

## Behaviour

- **Rows.** `sheet.rowCount` rows, plus a blank tail that grows by 1,000 as the
  viewport approaches it, so scrolling never reaches a floor. Rows with no data
  are ordinary editable blank cells.
- **Scroll.** The container's spacer is capped at 8,000,000px and real offsets
  are mapped through a ratio: 5,000,000 rows is 160,000,000px of content, well
  past the ~33.5M (Chrome/Safari) and ~17.9M (Firefox) element limits. The
  wheel is handled directly so a notch still moves about three rows. Scrollbars
  are hidden — at that range the thumb says nothing useful.
- **Columns.** Types come from the payload; unknown types degrade to `string`.
  Clicking a column header opens the panel to edit its name and type; clicking
  the `+` after the last column adds one. Widths are uniform and fixed.
- **Editing.** Fully canvas-drawn: the text, the selection and the blinking
  caret are painted, and a 1×1 hidden textarea holds focus and captures keys,
  IME, and paste. Enter/Tab/Escape/F2/arrows behave as in a spreadsheet. An
  entry that does not parse for its column type is kept as raw text and painted
  in the destructive colour rather than discarded.
- **JSON cells.** Painted as a capsule chip labelled with the key count; never
  editable inline. Clicking the chip — or a blank cell in a JSON column — opens
  an editable key/value table that writes straight back to the cell.
- **The panel** slides in over the sheet from the right, inside the row below
  the header, so it never covers the column names and never resizes or reflows
  the grid. It stays mounted and inert while closed so it can animate out.
- **Theme.** Canvas colours are read from the CSS custom properties and
  re-read when the `<html>` class changes, so the sheet follows the theme with
  no hard-coded values. Header and gutter use `--card`.
- **Accessibility.** The scroll container is a `role="grid"` with
  `aria-rowcount`/`aria-colcount`, the hidden textarea is labelled, and the
  painted `+` has a real screen-reader-only button behind it. Per-cell reading
  by assistive tech is **not** supported — the cells are pixels.
- **Not implemented:** pagination (`hasMore`/`nextCursor` are parsed and
  ignored — unfetched rows simply render blank), multi-cell selection, TSV
  paste, column reorder or delete, row insert or delete, undo/redo, formulas,
  sorting, filtering, and persistence.

## Reusable pieces

- `hooks/use-canvas-surface.ts` is feature-agnostic — any canvas that must be
  crisp and track an element's size should use it rather than re-deriving DPR
  handling.
- The `.scrollbar-none` utility and the `duration-smooth`/`ease-smooth` motion
  pair live in `packages/ui` and are meant to be shared; the sidebar already
  uses the motion pair.
- The type selector is a native `<select>` styled with tokens, on purpose:
  Radix Select portals and traps focus, which fights the grid's focus proxy. If
  a second feature needs one, move it to
  `packages/ui/src/components/select.tsx` — still native, still unanimated.

## Linked routes

- `/` ([root.md](root.md)) — same shell; this page is full-bleed like
  `/resume` rather than guttered.
- `/resume` ([resume.md](resume.md)) — the other full-bleed, canvas-drawing
  route.
