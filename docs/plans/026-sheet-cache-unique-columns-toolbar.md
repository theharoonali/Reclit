# 026 — Sheet cache on return, unique column names, icon toolbar

**Status:** implemented
**Scope:** full feature

## Goal

Four fixes on `/ai-spreadsheet` and `/populate`:

1. A column reorder — and every other grid edit — survives leaving the page and
   coming back; today the grid rebuilds from a cached pre-edit snapshot until a
   full reload.
2. The Populate API card reflects column changes as soon as the page is opened.
3. A sheet cannot hold two columns with the same name.
4. The header toolbar: Import, Export and the two deletes are icon-only
   buttons (Hugeicons) with tooltips; the Run button visibly lights up when the
   selection (click, or shift-click for a range) holds runnable AI cells.

## Backend (Agent 1)

- **Table(s):** none. No unique index — existing sheets may already hold
  duplicates, and a migration would fail on them.
- **Procedures:** `spreadsheet.createColumn` and `spreadsheet.updateColumn` gain
  `CONFLICT` (`SPREADSHEET_COLUMN_NAME_TAKEN`, REST 409) when another column of
  the sheet has the name, compared trimmed and case-insensitively.
- **Service methods:** `SpreadsheetColumnsService.assertNameFree(sheetId, name,
  exceptIndex?)`; `inferSheet` de-duplicates imported headers
  (`Name`, `Name (2)`, …) so an import can never create what the API refuses.
- Populate keeps "first duplicate wins" for sheets that already have
  duplicates; its contract test plants the duplicate through prisma.

## Frontend (Agent 2)

- **Route(s):** `/ai-spreadsheet`, `/populate`.
- **Components:** `ai-spreadsheet-loader` (query options),
  `ai-spreadsheet-column-form` (`takenNames` + inline error),
  `ai-spreadsheet-header-action` (`iconOnly`, `highlight`, Hugeicons),
  `@reclit/ui/button` (`icon-sm` size), `populate-api-card` (`staleTime: 0`).
- **States:** none new. No new token.

## Integration (Agent 3)

- Nothing new is called. The sheet query keeps its key, so the import's
  `invalidateQueries` still refreshes it.

## Decisions

- **Stale sheet on return:** the loader's query gets `gcTime: 0` +
  `staleTime: Infinity` and no focus/reconnect refetch. The cache entry dies
  with the page, so every visit fetches the server's truth; while mounted
  nothing refetches, which keeps the local-model deviation
  (`use-sheet-sync.ts`) intact. Rejected: invalidating `spreadsheet.rows` after
  each edit — a refetch mid-edit re-normalises the model under a debounced
  write and remounts the canvas.
- **Populate card:** `staleTime: 0` rather than invalidating from five column
  mutations — it also picks up changes made through the API or another tab.
- **Name uniqueness is case-insensitive** (`Company` = `company`): the names
  become form labels and API keys, where a case-only difference is a trap.
- **Hugeicons for the sheet toolbar** at the user's request; `lucide-react`
  stays the icon set everywhere else. FRONTEND.md records the exception.
- **Run effect:** filled primary + a breathing halo (`animate-pulse`,
  `motion-reduce:animate-none`) while runnable. Tailwind's built-in animation,
  so no keyframes are added to the unanimated `@reclit/ui`.

## Risks / open questions

- A very fast leave-and-return can fetch before the unmount flush of pending
  cell writes lands. The writes are sent first, so this is a narrow race.
- Two concurrent `createColumn` calls with one name can both pass the check —
  there is no unique index to stop them. Accepted while there is one user.

---

## Outcome

- **Shipped:**
  - Cache: `ai-spreadsheet-loader.tsx` — `gcTime: 0`, `staleTime: Infinity`,
    no focus/reconnect refetch. Verified in the browser: leaving for
    `/populate` and coming back client-side fires a second `spreadsheet.rows`
    fetch (it fired none before, for two minutes).
  - Populate card: `staleTime: 0` on `populate.form`; revisiting the page
    refetches (verified, 1 → 2 requests).
  - Unique names: `SpreadsheetColumnNameTakenError` (409) +
    `assertNameFree` in `spreadsheet-columns.service.ts`; `uniqueName` in
    `spreadsheet-import.infer.ts`; `lib/ai-spreadsheet/column-names.ts` and the
    column form's inline error (verified: " company " is refused, Save
    disabled; a new name clears it).
  - Toolbar: `icon-sm` Button size; `ai-spreadsheet-header-action.tsx` takes a
    Hugeicons glyph, `iconOnly` and `highlight`; Import, Export, cell clear and
    row delete are icon-only with tooltips; Run turns filled with a breathing
    halo while runnable (verified with a click and a shift-click range —
    "Run 5 cells").
- **Deviated:** cell clear uses the trash glyph (`Delete02Icon`), not an
  eraser — its label is "Delete" and the eraser read as a boxed ×.
- **Not done:** a database unique index on column names (needs a de-duplication
  migration for existing sheets first); awaiting the unmount flush before the
  next visit's fetch.
- **Docs updated:** `docs/rules/FRONTEND.md` (Hugeicons exception, `icon-sm`),
  `docs/routes/{ai-spreadsheet,populate}.md`,
  `docs/features/{spreadsheet,populate}.md`; contracts
  `spreadsheet.api.test.ts` (CONFLICT rows, notes, three tests) and
  `populate.api.test.ts` (duplicate planted through prisma); frontend test
  `tests/ai-spreadsheet/column-names.test.ts`.
