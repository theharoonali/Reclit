# `/ai-spreadsheet`

**Purpose:** a spreadsheet rendered on `<canvas>` — endless vertical scroll,
typed columns the user can add, reorder and delete, cell editing drawn on the
canvas, JSON / date / file cells edited in a side panel, and AI cells run
against a column prompt with live status.

**Rendering:** dynamic (`force-dynamic`). The page prefetches
`workspace.list`; a client loader reads the active workspace's
`spreadsheetId` (via `useWorkspace()`), fetches its rows, and hands the
payload to the grid. Switching workspaces swaps the sheet without a URL
change.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/ai-spreadsheet/page.tsx` | RSC | `pageMetadata`, `prefetch(workspace.list)`, full-bleed `h-full` wrapper |
| `apps/dashboard/src/components/ai-spreadsheet/ai-spreadsheet-loader.tsx` | client | active workspace's sheet → merged `rows` pages → grid; loading/error/empty states |
| `…/ai-spreadsheet-grid.tsx` | client | the main component; takes `payload`, owns panel state, mounts every header control |
| `…/ai-spreadsheet-header.tsx` | client | header canvas (`h-sheet-header`), pointer routing, the screen-reader "add column" button, the grip tooltip anchor |
| `…/ai-spreadsheet-body.tsx` | client | body canvas, scroll container, scroll spacer |
| `…/ai-spreadsheet-input-proxy.tsx` | client | the hidden textarea and the key bindings |
| `…/ai-spreadsheet-side-panel.tsx` | client | the docked panel frame (`w-panel`) |
| `…/ai-spreadsheet-column-form.tsx` | client | add **and** edit a column (name, type, node, prompt) |
| `…/ai-spreadsheet-json-editor.tsx` | client | the stacked key/value entries behind a JSON cell |
| `…/ai-spreadsheet-date-editor.tsx` | client | UTC calendar behind a date cell |
| `…/ai-spreadsheet-upload-editor.tsx` | client | upload panel behind file and audio cells (`POST /files`) |
| `…/ai-spreadsheet-header-action.tsx` | client | one header control (`HeaderActions` + error + `Button`, Hugeicons glyph); `iconOnly` moves the label to `aria-label` + a tooltip; every toolbar control is an instance of it (Run is the assistant capsule's) |
| `…/ai-spreadsheet-import-button.tsx` | client | Import: the header action with a hidden file input (`useFilePicker`), and the preview dialog a picked file opens |
| `…/ai-spreadsheet-import-dialog.tsx` · `ai-spreadsheet-import-sample.tsx` | client | the read-only import preview: file column → existing / new column, values left blank, the first rows as stored; Cancel / Import N rows |
| `apps/dashboard/src/components/assistant/use-page-action.ts` | hook | `useAssistantPageAction` — publishes Run to the header's assistant capsule as its right-hand pill while the selection holds an AI cell with a prompt ("Run N cells" for more than one; "Working…" and disabled while any of them is working) — label, busy state and the refusal copy; withdrawn otherwise. Shared with the dashboard's AI Recommendations pill ([root.md](root.md)) |
| `…/ai-spreadsheet-selection-bar.tsx` | client | "N rows selected" + Delete rows; renders nothing without a whole-row selection |
| `…/ai-spreadsheet-drag-chip.tsx` | client | the card that rides the pointer during a column drag |
| `…/use-sheet-labels.ts` | hook | resolves the canvas's i18n copy once and hands it to the painters as data |
| `…/use-sheet-model.ts` | hook | payload → `SheetModel`; `getCell`/`setCell`/`addColumn`/`updateColumn`/`applyColumnOrder` |
| `…/use-sheet-sync.ts` | hook | persists cell/column edits through tRPC without re-rendering the grid; `flushPending`, `discardPending` |
| `…/use-sheet-canvas.ts` | hook | wires sizing, painting, pointer routing and the editor (composes the hooks below) |
| `…/use-sheet-viewport.ts` · `use-sheet-scroll.ts` · `use-sheet-pointer.ts` | hook | viewport ref + rAF paint scheduler + palette refresh · virtual↔native scroll mapping · pointer → hit routing |
| `…/use-cell-editor.ts` | hook | the edit state machine, cell, whole-row and multi-area selection (`selectRange`, `toggleArea`, `clearSelection`), clear |
| `…/use-sheet-selection.ts` | hook | the whole-row selection read off the editor's rectangle (`row-selection.ts`), the batch delete mutation |
| `…/use-sheet-drag-select.ts` | hook | the press-and-drag selection: pointer capture, cells / rows mode, edge autoscroll |
| `…/use-column-remove.ts` · `use-column-reorder.ts` · `use-column-drag.ts` | hook | per-column delete · the (optimistic) reorder mutation · the drag: capture, threshold, drop slot, autoscroll |
| `…/use-sheet-import.ts` | hook | `pick` previews a CSV/XLSX/DOCX, `confirm` flushes pending writes, merges it and refreshes the grid without remounting it, `cancel` drops the preview |
| `…/use-sheet-audio.ts` | hook | one shared `Audio` element and which audio cell is playing |
| `…/use-run-cells.ts` · `use-run-listening.ts` · `use-sheet-runs.ts` | hook | Run: what the selection would run (`planRunBatches`) + one `runAi.runCells` call per batch · whether the sheet streams · the `runAi.onChange` subscription and the per-cell working-run map (`seed` takes the whole batch) |
| `apps/dashboard/src/lib/ai-spreadsheet/*.ts` | pure | types, geometry (`HEADER_HEIGHT` from `@reclit/ui/tokens`), palette (`theme-colors.ts`, read from the CSS variables with a fallback built from `colors.light`), formatting, text metrics, five painters, `run-state.ts`, `run-status.ts`, `run-targets.ts` (`selectionRect`, `selectionRects`, `planRunBatches`, the run caps in lockstep with the contract), `row-selection.ts` (`rowRangeAddresses`, `selectedRowRange`, `storedRowBounds`, `storedRowsIn`, `selectAllState` — a row selection is the rectangle spanning every column), `short-ids.ts`, `export-csv.ts`, `import-file.ts` (`fetchAllRows` lives in the shared `lib/spreadsheet/fetch-all-rows.ts`) (`uploadFile` lives in the shared `lib/upload-file.ts`) |
| `apps/dashboard/src/hooks/use-canvas-surface.ts` · `use-file-picker.ts` · `use-latest-ref.ts` · `use-reseed.ts` | hook | feature-agnostic: DPR-correct canvas · hidden file input · latest-value ref · prop-following draft state |
| `apps/dashboard/src/components/assistant/*` · `lib/assistant/*` · `config/assistant.ts` | client / pure | The assistant island in the header, in scope `spreadsheet` here — listed in [root.md](root.md). The sheet's `registerPage` handler is `use-assistant-refresh.ts` below |
| `…/use-assistant-refresh.ts` | hook | Registers the sheet with the assistant while the grid is mounted: `flushPending` before a run; after its changes `flushPending` → reset the editor → invalidate `spreadsheet.rows` (the import's refresh path, flushing instead of discarding) |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`, `@reclit/ui/textarea`,
`@reclit/ui/select`, `@reclit/ui/capsule-select`, `@reclit/ui/calendar`,
`@reclit/ui/tooltip`, `@reclit/ui/cn`, `components/common/form-field.tsx`,
`components/layout/header-actions.tsx` (`HeaderActions` for the toolbar,
`HeaderCenter` for the island), `.scrollbar-none` and the
`duration-smooth`/`ease-smooth` motion pair from `packages/ui`.

## APIs called

Feature: [spreadsheet](../features/spreadsheet.md) ·
[file](../features/file.md) · [run-ai](../features/run-ai.md).

| Procedure / endpoint | When | Invalidates |
| --- | --- | --- |
| `workspace.list` | on load (prefetched; consumed via `WorkspaceProvider`) | — |
| `spreadsheet.rows` | on load, every page (`lib/spreadsheet/fetch-all-rows.ts` walks `hasMore`/`nextCursor` and merges) | — |
| `spreadsheet.setCell` | per cell edit, debounced 400 ms, latest wins; a failure snaps the cell back | — (local model is the truth) |
| `spreadsheet.createColumn` · `updateColumn` | column form submit; every field sent explicitly, so a cleared node/prompt goes out as `null` | — |
| `spreadsheet.removeColumn` | header × on a hovered column; pending writes discarded first | — |
| `spreadsheet.reorderColumn` | grip drop; **optimistic** — the response's order is reconciled only where it differs, a failure restores the snapshot | — |
| `spreadsheet.removeRows` | Delete rows in the header; pending writes discarded first | — |
| `runAi.runCells` | Run; pending writes are flushed and awaited first, the stream is opened, the returned `pending` runs are seeded into their cells in one paint | — |
| `runAi.listActive` · `runAi.onChange` (SSE) | `listActive` on load resumes a sheet mid-run; `onChange` streams while any run is working and ends with `closed` | — (a completed run's output is written into the model) |
| `POST /files` (REST, multipart) | file / audio cell upload; the cell stores the returned URL | — |
| `POST /spreadsheets/:id/import/preview` (REST, multipart) | a picked file; opens the preview, writes nothing | — |
| `POST /spreadsheets/:id/import` (REST, multipart) | Import confirmed; merges the file into the sheet | `spreadsheet.rows` — the one invalidation |
| Export | no API — CSV serialised from the in-memory model (`export-csv.ts`) | — |

The assistant island's calls (`assistant.start` / `active` / `onChange` /
`cancel` / `respond`, `POST /assistant/transcribe`) are tabled once in
[root.md](root.md); here the scope is `spreadsheet` and a run's refresh
invalidates `spreadsheet.rows` through the grid's registered handler
(`use-assistant-refresh.ts`).

The wire types in `lib/ai-spreadsheet/types.ts` are type-only aliases of
`RouterOutputs["spreadsheet"]["rows"]`. A row is nested — one `{ id, name,
value }` per stored cell, ordered by column index; a blank cell is an absent
entry. Short ids (`row.0`, `col.1`, `cell.0.1`) are deterministic, which is why
the optimistic `addColumn` id needs no reconciliation.

**Mutations do not invalidate `spreadsheet.rows`** (a recorded deviation from
the mutations-invalidate rule): a refetch would hand the grid a new payload and
remount — blank — the canvas. After an edit the mutated model ref is already
the truth. Import is the exception: it adds rows and columns server-side, so it
invalidates on purpose, having flushed every pending write first; that is safe because
`invalidateQueries` leaves the query `success`, so the grid re-renders instead
of remounting. Never `resetQueries`/`removeQueries` here.

## Behaviour

- **Rows.** `totalRows` rows plus a blank tail that grows by 1,000 as the
  viewport approaches it; blank rows are ordinary editable cells.
- **Scroll.** The spacer is capped at 8,000,000px and offsets are mapped
  through a ratio, so 5,000,000 rows stay under browser element limits. The
  wheel is handled directly (a notch ≈ three rows); scrollbars are hidden.
- **Columns.** Types come from the payload; unknown types degrade to `string`.
  Clicking a header opens the panel to edit; the `+` after the last column adds
  one, always on a blank form (every open remounts it, since the closed panel
  keeps rendering its last content while it slides away). Widths are uniform and fixed. Hovering a body cell for 300 ms opens a tooltip with its full content
  (`ai-spreadsheet-cell-tooltip.tsx`, text from `lib/ai-spreadsheet/cell-tooltip.ts`):
  the whole text, pretty JSON, a file/audio URL, and a working run's status;
  nothing for a blank cell. It hangs off a `pointer-events-none` box over
  the cell, like the grip tooltip. It is hoverable: a value taller than
  12rem scrolls inside it (the wheel scrolls the tooltip, not the sheet).
  Leaving the cell waits 150 ms before switching or closing, so the pointer
  can reach the tooltip; on it, it stays open until the pointer leaves it. A
  press, a scroll of the sheet, a drag or editing that cell close it at once. Hovering a header shows a red × (delete)
  at the right and a six-dot grip (reorder) at the left; the grip's lane is
  reserved on every column so the name never shifts.
- **Column nodes.** The form offers None / AI / Mail / API / Google Search.
  API is locked (a lock on the capsule; it cannot be selected) and is not a
  wire node. Mail is the wire node `email`. Choosing an unlocked node reveals
  a Prompt textarea, the node's whole configuration; Mail gets its own
  placeholder (`column.mailPromptPlaceholder`) saying it sends on Run.
  A column whose node has an icon (`ai` → Hugeicons `StarIcon`, `email` →
  `Mail01Icon`, `NODE_ICONS` in `lib/ai-spreadsheet/node-icons.ts`) shows it
  on its picker capsule and paints the same path data before its name in the
  header. An `ai` or `google_search` column's prompt is what Run executes; a
  Google Search column searches Google about the row before answering; a
  Mail column on a Text or JSON column drafts an email to one of the row's
  email cells and sends it, then shows "Sent to … : subject" (any other
  column type is not runnable).
- **Run.** The Run control is the outlined "Run AI" pill at the right end
  of the header's assistant capsule (the count is in its tooltip), present
  only while the selection holds an AI cell with a prompt; the toolbar has no
  Run button. It runs the AI cells of the selected areas: plain columns
  inside them are ignored, every row is a series (its AI columns run in
  display order, each fed the previous answer) and the rows run as a batch,
  column by column — one `runAi.runCells` call per distinct set of selected
  AI columns, so a rectangle is one call and a picked cell is sent exactly
  once. Clickable only while none of those cells is working — the API
  refuses the whole batch otherwise; meanwhile the pill stays, disabled and
  reading "Working…", and re-enables when the runs finish. The tooltip reads
  "Run N cells" for more than one target. Clicking flushes pending edits, opens the stream,
  creates the runs and seeds their `pending` capsules ("Starting…" until the
  API answers). A selection over 1,000 rows or 5,000 AI cells (overlapping
  areas counted twice) is refused
  inline before any request (`listen.errorTooLarge`); `CONFLICT` (a cell
  became busy meanwhile) shows in the capsule too, until dismissed.
- **Working runs.** A cell with a working run paints a borderless capsule with
  a dot and the status label: `pending` muted, `running` success, any custom
  stage in primary. The dot's halo breathes (1.2 s, repainted every 40 ms only
  while a run is working). `completed`/`failed` are never painted — the
  capsule goes, a completed run's output becomes the value. An older event
  never displaces a newer run (`run-state.ts`).
- **Editing.** One click selects, a second (or Enter / F2) opens. Text,
  selection and caret are painted; a 1×1 hidden textarea holds focus and
  captures keys, IME and paste. Enter/Tab/Escape/arrows behave as in a
  spreadsheet; moving away commits, only Escape discards. Text that does not
  parse for its column type stays local-only and paints in the destructive
  colour, so the server never sees a value it would reject.
- **Multi-cell selection.** The selection is a set of areas. Shift+arrows or
  a press-and-drag extend the current area into a rectangle from its anchor
  (the drag captures the pointer and autoscrolls within 48px of an edge; a
  touch pan is still a scroll). Shift+click picks a cell as an area of its
  own, keeping the others — a press with shift that moves grows the new area
  into a rectangle, and shift-clicking an area that is exactly that cell
  unpicks it; a plain click collapses everything to one cell. The selection's
  rows tint their gutter cells. While any cell is selected a
  `destructive-outline` Delete shows in the header; it and Delete/Backspace
  blank every stored cell in every area via the debounced `setCell(null)`
  path (walking the sparse cell map, not the areas). The areas are also what
  Run executes; the Run button re-plans whenever they change
  (`onSelectionChange`), never per keystroke.
- **Capsule cells.** JSON, file, audio and boolean values paint as chips at
  one shared inset; a value that does not match its column falls back to
  destructive text. JSON: labelled with the key count, edited in the panel as
  stacked key/value entries (nested values pretty-printed). File: labelled
  with the last path segment; click opens the file, Enter/F2/double-click
  opens the upload editor. Audio: a play/pause control before the name; one
  shared `Audio` element, so one note at a time; a URL that fails to load
  clears the chip. Boolean: bordered and dotted in `--success` / `--warning`;
  opening the cell toggles it (blank → true), typing still opens text edit.
- **Date cells** open the panel's calendar. Everything is UTC, and picking a
  day carries over the time of day the cell already held. Typing still edits
  inline.
- **Row selection & delete.** The gutter is row numbers only. Clicking a
  number selects the whole row — the rectangle spanning every column, active
  cell in the first; a drag down the numbers extends it and shift-click picks
  another row as an area of its own (or unpicks it); the header corner's
  checkbox selects every row from the first stored one to the last (partial
  paints at reduced alpha) and clears again once every stored row is
  selected. While every area spans every column, "N rows selected" and a
  destructive Delete rows button appear in the header; Delete sends the
  stored rows inside those rows (blank rows alone send nothing), the rows go
  blank in place — indexes never shift — and the selection clears.
- **Column reorder.** Pressing the grip and moving more than 4px starts the
  drag (no hold timer, and a press that never passes it does nothing — not
  even opening the panel). There is no insertion line: the dragged column
  lifts onto a card that rides the pointer, and the remaining columns shift
  into the order the drop would produce, leaving a tinted well. Preview is
  paint state only (`column-order.ts`); the pointer is captured, and holding
  within 48px of either edge autoscrolls. Dropping in place fires nothing.
  `touch-none` on the header strip makes it work on touch.
- **The sheet is fetched on every visit.** Grid edits never write back to the
  `spreadsheet.rows` query (the local-model deviation), so a cached payload is
  a pre-edit snapshot. The loader's query therefore has `gcTime: 0` — the
  entry dies with the page, and coming back refetches — plus
  `staleTime: Infinity` and no focus/reconnect refetch, so nothing replaces the
  payload under a mounted grid except an import's explicit invalidation.
  Before this, a reordered column snapped back for up to two minutes after
  leaving and returning.
- **Column names are unique** per sheet, trimmed and case-insensitive
  (`lib/ai-spreadsheet/column-names.ts` mirrors the backend rule). The column
  form shows an inline error and disables Save for a taken name: adds and
  renames are optimistic, so the refusal has to happen before the model
  changes.
- **Toolbar.** Import is a text button labelled "Import". Export, cell clear
  and row delete are icon-only buttons (`size="icon-sm"`, label in
  `aria-label` and a tooltip). Run is
  not in the toolbar: it **appears** in the assistant capsule the moment the
  selection (a click, a shift-click or drag for a range, a row number) holds
  an AI cell with a prompt — a pill outlined in the primary colour, labelled
  "Run AI", with the cell count in its tooltip; disabled and reading
  "Working…" while any of those cells is working — and goes when it does not.
- **The assistant island** sits centred over the toolbar (absolutely
  positioned, so the toolbar growing never moves it) and, in this scope, can
  create, rename, retype, reorder columns, write cells and append rows;
  removing a column or rows asks inside the capsule first. Behaviour and
  states: [root.md](root.md).
- **Import / Export.** Both are header actions. Import ("Reading…" while
  the file is read) opens a preview dialog; Import N rows merges — matching
  columns are filled, other columns added, rows appended below — and Cancel
  writes nothing ("Importing…" while it runs, failure inline with the sheet
  untouched). .csv, .xlsx and .docx (every table, combined) are accepted.
  Export downloads CSV (RFC 4180 quoting, UTF-8 BOM, filename from the sheet
  name) with raw values so the file re-imports cleanly.
- **The panel** slides in over the sheet inside the row below the header, so
  it never covers the column names and never reflows the grid. It stays
  mounted and inert while closed so it can animate out; its editors follow the
  cell through `useReseed`.
- **Theme.** Canvas colours are read from the CSS custom properties (and
  re-read when the `<html>` class changes); the first paint uses a fallback
  built from `colors.light` in `tokens.ts`. Header and gutter use `--card`.
- **Accessibility.** The scroll container is `role="grid"` with
  `aria-rowcount`/`aria-colcount`; the hidden textarea is labelled; the
  painted `+` has a real screen-reader-only button. The reorder grip is
  pointer-only, and per-cell reading by assistive tech is not supported —
  the cells are pixels.
- **Not implemented:** windowed paging tied to scroll position (the loader
  reads every *stored* row up front — bounded by import's 20,000 cap), TSV
  paste, keyboard row selection, keyboard column reorder, row insert in the
  UI, undo/redo, formulas
  (the `formula` type is storage-only and edits as text), sorting, filtering.

## Reusable pieces

- `hooks/use-canvas-surface.ts` — any crisp canvas that tracks an element's
  size. `hooks/use-file-picker.ts`, `use-latest-ref.ts`, `use-reseed.ts` — the
  three patterns this feature needed that any feature might.
- `ai-spreadsheet-header-action.tsx` is the reference for a page control in
  the app header.
- `@reclit/ui/select` portals, but does not fight the grid: the input proxy
  re-focuses only on a pointerdown on the canvas and never on blur. The picker
  offers every `ColumnType` except `formula` (`columnTypes` in
  `cell-format.ts`).
- `@reclit/ui/calendar` renders inline and is deliberately not wrapped in a
  popover — the panel is already the layer.
- `apps/dashboard/tests/support/canvas.ts` records draw calls instead of
  drawing; the painters are pure functions over a context, so that is how they
  are asserted without a browser ([TESTING.md](../rules/TESTING.md)).

## Linked routes

- `/` ([root.md](root.md)) — same shell; this page is full-bleed rather than
  guttered.
