# 012 — Spreadsheet UX batch: column delete, cell multi-select, CSV export, styling

**Status:** implemented
**Scope:** full feature

## Goal

The sheet gets a rounder editing experience: hovering a column header shows a
delete button that removes the whole column (its index stays a permanent gap —
nothing renumbers), shift+click / shift+arrows select a rectangle of cells that
a red-outline header Delete button (or the Delete key) blanks, an Export button
downloads the sheet as CSV, the header search bar (wired to nothing) is gone,
node capsules are outlined instead of filled, and the menus slide a touch
slower.

## Backend (Agent 1)

- **Tables:** none changed — the positional id scheme carries interior gaps
  already.
- **Procedures:** `spreadsheet.removeColumn` loses its CONFLICT: any column can
  be deleted (errors: NOT_FOUND only). `spreadsheet.createColumn` unchanged on
  the wire but now appends at max stored index + 1.
- **Service methods:** `removeColumn` — drop the last-only guard, keep
  `columnOrThrow` + the cells+column transaction; `createColumn` — replace
  `prisma.column.count` with a `_max.index` aggregate (count collides with the
  unique index once a gap exists). `SpreadsheetColumnNotLastError` deleted.
- Reused: the existing transaction shape from `removeRow`.

## Frontend (Agent 2)

- **Route:** `/ai-spreadsheet`, unchanged.
- **Components:** new `ai-spreadsheet-export-button.tsx`,
  `ai-spreadsheet-cell-clear-button.tsx`, `use-column-remove.ts`; extended
  `use-cell-editor.ts` (anchor + extend + clear), `use-sheet-model.ts`
  (`removeColumn`), pointer/paint/geometry for the header delete affordance and
  the range wash; new pure `lib/ai-spreadsheet/export-csv.ts`. Search bar
  removed from `layout/app-header.tsx`.
- **packages/ui:** new Button variant `destructive-outline` (border + text in
  `--destructive`, transparent bg); `CapsuleSelect` checked state becomes
  `border-primary text-primary bg-transparent`; `transitionDuration.smooth`
  220ms → 300ms.

## Integration (Agent 3)

- Header delete glyph → `useColumnRemove` → `spreadsheet.removeColumn`; on
  success the model ref drops the column (no `spreadsheet.rows` invalidation —
  the recorded canvas deviation), `columnsVersion` re-renders.
- Cell clearing reuses the debounced `useSheetSync.setCell(null)` path per
  stored cell in the rectangle.
- Export reads `modelRef` directly and downloads a Blob; no API call.

## Decisions

- Interior column delete leaves a permanent index gap rather than renumbering —
  renumbering would rewrite every later column and cell pk.
- `createColumn` mints max+1, not count, so gaps are never refilled and the
  client's optimistic `col.<nextColumnIndex>` id still matches.
- The selection lives in `editorRef` (anchor + active), not React state; the
  header button re-renders only on the empty ↔ non-empty flip.
- Clearing walks the sparse cell map, not the selected rectangle — a rectangle
  can span millions of virtual rows.
- CSV exports raw values (stringified JSON, unlocalised numbers) so the file
  round-trips through the importer; `editableText` was rejected because it
  empties JSON cells.
- No new bulk-clear API: per-cell `setCell(null)` reuses coalescing and revert;
  grouping into `updateRow` is the follow-up if large clears ever hurt.
- The REST 409 contract example moved from non-last-column delete (now legal)
  to `createRow` on an existing index.

## Risks / open questions

- A huge selection clear fires one `setCell` mutation per stored cell after the
  debounce; acceptable at current scale, `updateRow` batching is the escape
  hatch.
- `removeColumn` failure is silent (model untouched); a toast system does not
  exist yet — same stance as failed cell writes.

---

## Outcome

- **Shipped:** everything above. Backend:
  `apps/api/src/modules/spreadsheet/spreadsheet-cells.service.ts`,
  `spreadsheet.errors.ts`, contract test. UI package: `button.tsx`,
  `capsule-select.tsx`, `tailwind.config.ts`. Dashboard: the components/hooks
  listed under Frontend, `lib/ai-spreadsheet/{export-csv,geometry,paint-header,
  paint-body,types}.ts`, `layout/app-header.tsx`, `messages/en.json`.
- **Deviated:** nothing material.
- **Not done:** shift+drag selection (only click/arrows), a visible error for a
  failed column delete, batched clearing.
- **Docs updated:** contract header, `docs/features/spreadsheet.md`,
  `docs/routes/ai-spreadsheet.md`, `docs/rules/FRONTEND.md` (header row).
