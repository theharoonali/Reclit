# `/ai-spreadsheet`

**Purpose:** a spreadsheet rendered on `<canvas>` — endless vertical scroll,
typed columns the user can add, cell editing drawn on the canvas, and JSON and
date cells edited in a side panel.

**Rendering:** dynamic (`force-dynamic`). The page prefetches
`workspace.list`; a client loader reads the active workspace's
`spreadsheetId` (via `useWorkspace()`), fetches its rows, and hands the
payload to the grid. Switching workspaces swaps the sheet without a URL
change.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/ai-spreadsheet/page.tsx` | RSC | metadata, `prefetch(workspace.list)`, full-bleed `h-full` wrapper |
| `…/ai-spreadsheet-loader.tsx` | client | active workspace's sheet → merged `rows` pages → grid; loading/error/empty states |
| `apps/dashboard/src/components/ai-spreadsheet/ai-spreadsheet-grid.tsx` | client | the main component; takes `payload`, owns panel state and the i18n labels |
| `…/ai-spreadsheet-header.tsx` | client | header canvas, click routing, the screen-reader "add column" button |
| `…/ai-spreadsheet-body.tsx` | client | body canvas, scroll container, scroll spacer |
| `…/ai-spreadsheet-input-proxy.tsx` | client | the hidden textarea and the key bindings |
| `…/ai-spreadsheet-side-panel.tsx` | client | the docked panel frame |
| `…/ai-spreadsheet-column-form.tsx` | client | add **and** edit a column (name + type) |
| `…/ai-spreadsheet-json-editor.tsx` | client | the stacked key/value entries behind a JSON cell |
| `…/ai-spreadsheet-date-editor.tsx` | client | UTC calendar behind a date cell |
| `…/ai-spreadsheet-upload-editor.tsx` | client | upload panel behind file and audio cells (`POST /files`) |
| `…/ai-spreadsheet-import-button.tsx` | client | the Import control, portalled into the app header |
| `…/ai-spreadsheet-export-button.tsx` | client | the Export (CSV download) control, portalled into the app header |
| `…/ai-spreadsheet-cell-clear-button.tsx` | client | the red-outline Delete for the cell selection, portalled into the app header |
| `…/ai-spreadsheet-selection-bar.tsx` | client | the "N rows selected" + Delete control, portalled into the app header |
| `…/use-sheet-selection.ts` | hook | the gutter's tick set, select-all, and the batch delete mutation |
| `…/use-column-remove.ts` | hook | the header's per-column delete mutation and local-model cleanup |
| `…/ai-spreadsheet-drag-chip.tsx` | client | the card that rides the pointer during a column drag |
| `…/use-column-drag.ts` | module | the reorder drag: pointer capture, threshold, drop slot, edge autoscroll |
| `…/use-column-reorder.ts` | hook | the reorder mutation, and applying the order the API returns |
| `…/use-sheet-import.ts` | hook | uploads a CSV/XLSX, then refreshes the grid without remounting it |
| `…/use-sheet-canvas.ts` | hook | wires sizing, painting, pointer routing and the editor |
| `…/use-sheet-audio.ts` | hook | one shared `Audio` element and which audio cell is playing |
| `…/ai-spreadsheet-run-button.tsx` | client | the Run control, portalled into the app header; "Live" and inert while the sheet streams |
| `…/use-run-listening.ts` | hook | whether the sheet streams: `listActive` on load (a reload resumes a sheet mid-run), Run opens the stream ahead of the first run, `closed` ends it |
| `…/use-sheet-runs.ts` | hook | the `runAi.onChange` subscription while listening: the working run per cell, the pulse interval, and writing a finished run's output into the model |
| `…/use-sheet-sync.ts` | hook | persists cell/column edits through tRPC without re-rendering the grid |
| `…/use-sheet-model.ts` | hook | payload → `SheetModel`; `getCell`/`setCell`/`addColumn`/`updateColumn`/`applyColumnOrder` |
| `…/use-sheet-viewport.ts` | hook | viewport ref, rAF paint scheduler, palette/font refresh |
| `…/use-sheet-scroll.ts` | hook | virtual↔native scroll mapping, wheel, blank-tail growth |
| `…/use-cell-editor.ts` | hook | the edit state machine |
| `…/sample-payload.ts` | data | a payload fixture for the dashboard tests |
| `apps/dashboard/src/lib/ai-spreadsheet/*.ts` | pure | types, geometry, palette, formatting, text metrics, four painters; `run-state.ts` (folds the run stream into the per-cell map), `run-status.ts` (known statuses, `formatRunStatus`), `short-ids.ts` (`parseScopedCellId`) |
| `apps/dashboard/src/hooks/use-canvas-surface.ts` | hook | generic DPR-correct canvas sized from another element |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`,
`@reclit/ui/label`, `@reclit/ui/select`, `@reclit/ui/calendar`, `@reclit/ui/cn`,
`components/layout/header-actions.tsx`, `.scrollbar-none` and the
`duration-smooth`/`ease-smooth` motion pair (both defined in `packages/ui`),
`config/nav.ts`, `components/layout/`.

## APIs called

Feature: [spreadsheet](../features/spreadsheet.md) ·
[file](../features/file.md) · [run-ai](../features/run-ai.md).

- Live, only while the sheet has working runs: `runAi.listActive` on load
  (non-empty → subscribe, so a reload resumes a sheet mid-run), the Run
  button to subscribe ahead of the first run (`use-run-listening.ts`), and
  `runAi.onChange` (tRPC subscription over SSE) for the open sheet, from
  `use-sheet-runs.ts`. An idle sheet holds no connection. The first event is
  a snapshot of every working run; each later event is one run after a
  change; `closed` is the last — the last working run finished — and the
  sheet stops listening and drops every capsule. A working run paints a
  capsule in its cell; a `completed` run's `result.output` is written into the
  model with the model-only `setCell` — the API wrote the Cell row before it
  sent the event, so there is nothing to refetch and `spreadsheet.rows` is
  not invalidated. tRPC reconnects a dropped stream itself with the last event
  id, so a blip replays what was missed; a reload gets the persisted values
  from `spreadsheet.rows` and the working runs from a fresh snapshot.

- On load: `workspace.list` (prefetched in the RSC, consumed through
  `components/workspace/workspace-provider.tsx`), then `spreadsheet.rows` for
  the active workspace's sheet — every page of it. `rows` is paged
  at the API's `limit` cap, so `lib/ai-spreadsheet/fetch-all-rows.ts` walks
  `hasMore`/`nextCursor` and merges the pages into one payload before the grid
  sees anything; a sheet imported from a real file has far more rows than one
  page.
- On edit: `spreadsheet.setCell` (per-cell, debounced 400 ms, latest wins),
  `spreadsheet.createColumn` / `spreadsheet.updateColumn` from the column form
  (name, type, node, prompt — every field sent explicitly, so a cleared
  node/prompt reaches the wire as `null` rather than an omission).
- On row delete: `spreadsheet.removeRows` with every ticked row index; on
  success the rows are removed from the local model and repainted (the same
  no-invalidation deviation as cell edits).
- On column delete: `spreadsheet.removeColumn` with the column's wire index; on
  success the column and its cells are dropped from the local model (the wire
  index stays a permanent gap — nothing renumbers) and the grid re-renders via
  `columnsVersion`.
- On column reorder: `spreadsheet.reorderColumn` with the column's wire index
  and its new display position. **Optimistic**, unlike every other column
  mutation: the columns move the instant the pointer is released and the
  request follows, because waiting for the round trip snaps the grid back to
  the old order until it lands and then jumps forward again. The response still
  carries the whole order and is reconciled against what is on screen, but only
  where the two disagree, so the normal case costs no second render; a failure
  restores the pre-drop snapshot and the column springs back. Unlike a delete
  this does **not** discard pending cell writes: a reorder moves no wire index,
  so a debounced `setCell` still in flight remains addressed at the right cell.
- Export calls no API: the CSV is serialised from the in-memory model
  (`lib/ai-spreadsheet/export-csv.ts`) — the loader already merged every stored
  page, and unsaved debounced edits are included — and downloaded as a Blob.
- Audio uploads: REST `POST /files`, then the returned public URL is stored in
  the cell via `setCell`.
- Import: REST `POST /spreadsheets/:id/import` (multipart), sent for the sheet
  currently open. It replaces the sheet's whole grid — see
  [the feature doc](../features/spreadsheet.md).

The wire types in `lib/ai-spreadsheet/types.ts` are type-only aliases of
`RouterOutputs["spreadsheet"]["rows"]`, so they cannot drift from the backend.
A row is nested — one `{ id, name, value }` entry per stored cell, ordered by
column index — and a blank cell is an absent entry. A cell is addressed by
`(rowIndex, columnIndex)`; the short ids (`row.0`, `col.1`, `cell.0.1`) are
deterministic, which is why the optimistic `addColumn` id needs no
reconciliation.

Cell and column mutations deliberately do **not** invalidate
`spreadsheet.rows`: a refetch would hand the grid a new payload and re-normalise
the model for no reason. After an edit the mutated model ref is already the truth. A failed
cell write snaps the cell back to its pre-edit value and repaints; there is no
toast to announce it yet. Text that does not parse for its column type stays
local-only (painted destructive), so the server never sees a value it would
reject.

**Import is the one exception** — it *replaces* the sheet rather than editing
it, so the server is the truth and the model must be rebuilt. It invalidates
`spreadsheet.rows` on purpose. That is safe only because `invalidateQueries`
leaves the query `success`: the loader never falls back to `LoadingState`, so
the grid re-renders (new `payload` → `columnsVersion` → `syncGeometry` +
repaint) instead of remounting. `resetQueries`, `removeQueries` or a changed
query key would remount it, and a remounted canvas is a blank one. Before the
refetch the import discards every debounced cell write (`discardPending`) and
disowns any still in flight — otherwise one would land on the new grid, find its
key gone, and blank a freshly imported cell.

## Behaviour

- **Rows.** `spreadsheet.totalRows` rows, plus a blank tail that grows by 1,000 as the
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
- **Column delete.** Hovering a column header swaps its type name for a red ×
  at the right edge; clicking it calls `spreadsheet.removeColumn`. The column
  and its cells go for good and its wire index is never reused (later columns
  keep their ids — the grid just renders the remaining columns side by side).
  Pending debounced writes are discarded first, the panel closes if it was
  showing that column, and the active cell is clamped back into range.
- **Column nodes.** The panel form also offers a Node select (None / AI /
  Email; unknown server nodes degrade to None). Choosing a node reveals a
  Prompt textarea; setting it back to None hides the field and submits
  `prompt: null`. A column whose node has a glyph (`ai` → ✨, see
  `NODE_GLYPHS` in `paint-header.ts`) paints it left of its header name.
  Nothing executes prompts yet.
- **Run / Live.** The header's Run button opens the run stream ahead of the
  first run (one day it will also enqueue the sheet's AI columns); while the
  sheet streams the button reads "Live", filled and inert. Whether to stream
  is derived, not stored: a sheet with a run that is not completed or failed
  is live — on load too, so a reload resumes — and the stream ends by itself
  when the last working run finishes, like a chat generation ending.
- **Working runs.** While listening, a cell an AI run is working on paints a
  capsule instead of its value — even when the cell is empty — labelled with
  the run's status:
  `pending` grey (`muted-foreground`), `running` green (`success`), and any
  custom stage the backend reports (`analyzing`, …) in the primary orange.
  The chip has no outline — the only borderless capsule — just a 15 %-alpha
  fill, with the dot and the label in the status colour; the dot is solid and constant
  while a 30 %-alpha halo behind it breathes (radius `CAPSULE_DOT / 2` →
  `CAPSULE_PULSE_MAX`, one breath per 1.2 s, repainted every 40 ms only while
  a run is working). The four system statuses are message keys
  (`aiSpreadsheet.run.*`); a custom stage is data, shown tidied
  (`formatRunStatus`: `web_search` → "Web search"). `completed` and `failed`
  are never painted: the capsule goes, and a completed run's output becomes
  the cell's value. One cell has at most one working run (the database
  enforces it); a newer run for a cell replaces an older one, and an older
  event can never displace a newer run (`run-state.ts`).
- **Editing.** One click selects a cell, a second opens it — Enter and F2 do
  the same from the keyboard. Editing is fully canvas-drawn: the text, the
  selection and the blinking caret are painted, and a 1×1 hidden textarea holds
  focus and captures keys, IME, and paste. Enter/Tab/Escape/arrows behave as in
  a spreadsheet, and moving away mid-edit — clicking another cell, or focus
  leaving the grid — commits the edit rather than discarding it (only Escape
  discards); an unchanged buffer commits nothing. An entry that does not parse
  for its column type is kept as raw text and painted in the destructive
  colour rather than discarded.
- **Multi-cell selection.** Shift+click (or shift+arrows) extends a rectangle
  from the anchor — the last plainly-selected cell — to the target; it is
  painted as a translucent ring-coloured wash with its own ring, the active
  cell's ring on top. A plain click or arrow collapses it. While any cell is
  selected a red-outline **Delete** button (the `destructive-outline` Button
  variant from `packages/ui`) shows in the app header; it and the Delete /
  Backspace keys blank every stored cell in the rectangle via the same
  debounced `setCell(null)` path as typing. The clearing walks the sparse cell
  map, not the rectangle, so a selection spanning millions of virtual rows
  costs only the stored cells it covers. Shift+click never triggers capsule
  actions (file open, audio play).
- **The selection ring** is stroked inset by half its width. A stroke straddles
  its path, so ringing the cell bounds would put half the ring outside the
  cell, where the clip that protects the gutter eats it — the first column and
  first row would come out visibly thinner than the rest.
- **Capsule cells.** JSON, file, audio and boolean values are painted as chips
  rather than text, all starting at the same inset so the column still reads as
  a column. A value that does not match its column falls back to text in the
  destructive colour, so a bad value is visible rather than hidden behind a
  chip that would misrepresent it.
  - **JSON** — a neutral chip labelled with the key count; never editable
    inline. Clicking it, or a blank cell in a JSON column, opens an editable
    list of entries that writes straight back to the cell. Each entry is a
    stacked block laid out like the column form — a label above every field,
    the key on a single-line `Input`, the value on a full-height `Textarea`,
    and the entry's remove button on the key's label row. The two used to sit
    side by side in a three-column grid, which left each of them half the
    panel's width: too narrow to read a value of any length, and far too
    narrow to edit a nested object. Nested objects and arrays seed the textarea
    pretty-printed for the same reason; `JSON.parse` ignores the whitespace on
    the way back, so `26` still returns as a number and `Germany` still falls
    through to a raw string.
  - **File** — the cell holds the URL itself; the chip is labelled with the
    file name from its last path segment. Clicking the chip opens the file in
    a new tab; opening the cell (Enter, F2, double-click) opens the panel's
    upload editor — the file goes through `POST /files` and the cell stores
    the returned URL. Typing replaces the URL, and Delete clears it.
  - **Audio** — the cell holds the audio URL, and the chip carries a play
    control before the file name. Clicking it plays the note in place and
    turns the control into a pause; clicking again, or starting another note,
    stops it. The chip reserves the same width either way, so its clickable
    region does not move when playback starts. One `Audio` element is shared by
    the whole sheet, so only one note can sound at a time. A URL that fails to
    load clears the chip rather than leaving it stuck on pause. Opening the
    cell (Enter, F2, double-click) opens the panel's upload editor instead of a
    text edit — the file goes through `POST /files` into the public `reclit`
    bucket and the cell stores the returned URL. Typing still edits the URL.
  - **Boolean** — a chip bordered and dotted in `--success` for true and
    `--warning` for false. Opening the cell toggles it instead of editing text
    (a blank toggles to true); typing still opens the text editor, so a
    keystroke never silently flips a value.
- **Date cells** open the panel's calendar rather than an inline editor.
  Everything is UTC, matching how dates are painted, and picking a day carries
  over the time of day the cell already held — the grid shows only the date, so
  zeroing the time would be data loss the user could not see. Typing a date
  still edits inline.
- **Row selection & delete.** Every row's number gutter carries a painted
  checkbox — a square that fills with a mini primary-coloured box when ticked —
  and the header's corner block carries a select-all twin (partially-selected
  paints the mini box at reduced alpha). Clicking a row's checkbox toggles that
  row; the corner checkbox selects every stored row, or clears the selection
  when everything stored is already ticked. While anything is ticked, an
  "N rows selected" label and a destructive **Delete rows** button appear in
  the app header (portalled like Import). Deleting calls
  `spreadsheet.removeRows`: the Row and Cell records are removed from the
  database, indexes never shift (rows go blank in place), pending debounced
  cell writes are discarded first so none can re-create a deleted cell, and on
  success the rows are dropped from the local model and repainted. A failure
  shows inline beside the button with the selection kept.
- **Column reorder.** Hovering a column header reveals a six-dot grip at its
  left edge, mirroring the delete `✕` at the right. Its lane is reserved on
  every column whether hovered or not, so revealing the grip never shifts the
  name. The cursor is left alone — the grid never overrides what the user's
  system gives them — and a
  "Drag and drop" tooltip (`@reclit/ui/tooltip`) hangs off an empty anchor box
  parked over the painted glyph — the grip is pixels, so the tooltip needs
  something real to point at. The anchor is `pointer-events-none` and its `open`
  comes from the canvas hit-test: letting it take pointer events would break the
  drag that starts on the same press.
- **The drag itself.** Pressing the grip and moving more than 4px starts it — a
  movement threshold rather than a hold timer, so there is no dead period where
  the user has pressed and nothing has happened; a press that never passes it
  does nothing at all (the grip's only job is dragging, so it does not open the
  column panel a click on the header would). There is **no insertion line**.
  Instead the grid previews the result: the dragged column lifts out onto a
  card that rides the pointer showing its name, and the remaining columns —
  headers and cells together — shift into the order the drop would produce,
  leaving a tinted empty well where the column will land. The preview is paint
  state only (`lib/ai-spreadsheet/column-order.ts`); the model is untouched and
  the order the grid adopts still comes from the API's response. The pointer is
  captured, so the drag survives leaving the 36px header strip, and holding
  within 48px of either edge autoscrolls horizontally — a sheet is routinely
  wider than the viewport. Dropping calls `spreadsheet.reorderColumn`; dropping
  a column back where it started fires nothing, and the repaint is issued
  *after* the drop has moved the columns, never before — painting first would
  show the pre-drop order for a frame. All drag state lives in a ref and
  repaints, and the chip is moved by writing `transform` onto its node —
  never React state, which on this path would cost frames and risk remounting
  the canvas. `touch-none` on the header strip is what makes any of this work on
  a touch device — without it the browser claims the gesture as a pan before
  `pointermove` ever fires.
- **Import** is a button in the app header, not a bar of the sheet's own: it is
  portalled there with `<HeaderActions>`, so the grid keeps the whole content
  area and still owns the import state. Picking a `.csv`/`.xlsx` replaces the
  sheet's entire grid; the button reads "Importing…" while it runs and a failure
  shows inline beside it (`role="alert"`) with the sheet untouched.
- **Export** sits beside Import in the app header and downloads the sheet as
  CSV (RFC 4180 quoting, UTF-8 BOM for Excel, filename from the sheet name).
  Values export raw — unlocalised numbers, ISO dates, stringified JSON — so the
  file re-imports cleanly.
- **The panel** slides in over the sheet from the right, inside the row below
  the header, so it never covers the column names and never resizes or reflows
  the grid. It stays mounted and inert while closed so it can animate out.
- **Theme.** Canvas colours are read from the CSS custom properties and
  re-read when the `<html>` class changes, so the sheet follows the theme with
  no hard-coded values. Header and gutter use `--card`; the boolean chip uses
  `--success` and `--warning`. A token that fails to resolve paints black, so a
  black chip means a missing custom property, not a styling choice.
- **Accessibility.** The scroll container is a `role="grid"` with
  `aria-rowcount`/`aria-colcount`, the hidden textarea is labelled, and the
  painted `+` has a real screen-reader-only button behind it. The column-reorder
  grip has no such fallback: it is a painted glyph driven by pointer events,
  with no keyboard path to reordering. Per-cell reading by assistive tech is
  **not** supported — the cells are pixels.
- **Not implemented:** *windowed* paging tied to scroll position. The loader
  reads every **stored** row up front and merges the pages, which is bounded by
  what was actually written (rows are sparse, and import caps at 20,000) rather
  than by the 5,000,000-row virtual height — but a very large sheet is still one
  big payload on load. Rows past what is stored render blank, which is correct.
  Also not implemented: TSV paste, keyboard-driven column reorder (the grip is
  pointer-only — see Accessibility), row insert in the UI (row
  *delete* is implemented — see "Row selection & delete"), undo/redo, formulas
  (the `formula` column type is storage-only and edits as text), sorting, and
  filtering. Persistence **is** implemented — see "APIs called".

## Reusable pieces

- `hooks/use-canvas-surface.ts` is feature-agnostic — any canvas that must be
  crisp and track an element's size should use it rather than re-deriving DPR
  handling.
- The `.scrollbar-none` utility and the `duration-smooth`/`ease-smooth` motion
  pair live in `packages/ui` and are meant to be shared; the sidebar already
  uses the motion pair.
- The type selector is `@reclit/ui/select` — shadcn's Radix `Select`, with its
  enter/exit animations stripped. It portals, but that does not fight the grid:
  the input proxy re-focuses only on a pointerdown **on the canvas**
  (`ai-spreadsheet-grid.tsx` passes `onPointerDown` to the header and body only),
  and it deliberately does not re-focus on blur.
- The picker offers every `ColumnType` except `formula`. The API can return a
  formula column and the sheet paints it as text, but there is no editor for one
  yet — see `columnTypes` in `lib/ai-spreadsheet/cell-format.ts`.
- `packages/ui/src/components/calendar.tsx` is a shared, token-styled month
  calendar over `react-day-picker`. It renders inline and is deliberately not
  wrapped in a popover: the date editor lives in the side panel, where an
  inline month is more useful than a second layer of portal.
- `apps/dashboard/tests/support/canvas.ts` is a canvas context that records draw
  calls instead of drawing. The painters are pure functions over a context, so
  it is how they are asserted on without a browser. It lives under `tests/`
  rather than beside the painters because no test-only file belongs in `src/`
  — see [docs/rules/TESTING.md](../rules/TESTING.md).

## Linked routes

- `/` ([root.md](root.md)) — same shell; this page is full-bleed rather
  than guttered.
