# 021 — Google Search node

**Status:** implemented
**Scope:** full feature

## Goal

A column can carry a **Google Search** node: pick the column holding the
subject (Company Name), write what you want out of the results ("the company's
primary website domain"), and a Run click fills the cell with a value already
typed to the column — a `url` column gets a URL, a `string` column gets text.

The twist over the existing `ai` node is the input. An `ai` cell is given the
whole row; a search cell must be given **only** the columns the client names.
A sheet has many columns and one of them is the search subject; the rest is
noise the model has to filter and tokens paid for twice.

## Backend (Agent 1)

- **Tables:**
  - `NodeType` gains `GOOGLE_SEARCH`.
  - `Column` gains `config Json?` — per-node settings, shape decided by `node`.
    Today the only key is `sourceColumns` (1–8 column indexes, ordered).
    Migration `20260909225735_google_search_node`.
- **Procedures:** no new ones. `spreadsheet.createColumn` / `updateColumn`
  take `config?`; `SheetColumn` returns it. `config` follows `prompt`'s rules
  exactly — it requires a node (`SPREADSHEET_CONFIG_WITHOUT_NODE`), and
  clearing the node clears it.
- **Service methods:**
  - `isRunnable` (run-ai-batch.service) becomes a per-node switch: `ai` needs a
    prompt, `google_search` needs a prompt *and* source columns, `email` has no
    executor. Its dashboard mirror in `run-targets.ts` matches.
  - `prepare` branches: a search cell gets `row.cells: []` and
    `search.sourceColumns` resolved in configured order, dropping the target
    itself, removed columns and cells blank in this row.
    `RunAiNoSearchInputError` when nothing is left — per row, so one blank row
    fails alone.
  - `generateSearchCellValue` (`src/ai/search-output.ts`) — the node's
    executor, same `CellGeneration` shape as `generateCellValue`.
  - `googleSearch` (`src/ai/serpapi.ts`) — the SerpAPI call plus
    `toSearchResponse`, which trims a 30–50 KB body to the fields an answer is
    readable from.
- **Reused, not written:** `cellOutputSchema` and `TYPE_RULES` (the answer
  shape per column type — so "typed by the column" needed no new per-type
  code), `formatCellLine`, `cellValueMatchesType` via the newly extracted
  `coerceCellValue`, the `gemini.ts` lazy-key idiom, the `cell-attachments.ts`
  injected-`fetch` idiom, and the whole run/wave/stream machinery: one table,
  two tasks, one subscription. Only the generator branches.

## Frontend (Agent 2)

- **Route:** `/ai-spreadsheet`, unchanged.
- **Components:** `ai-spreadsheet-column-form.tsx` gains a **Search input**
  picker, shown only for a node that reads named columns. Checkboxes over the
  sheet's other columns (`@reclit/ui/checkbox`), each selected one badged with
  its position, because the pick order *is* the read order. No new primitive.
- **States:** a sheet with no other column shows
  `column.sourceColumnsEmpty` instead of an empty picker. A search column
  without source columns is simply not counted by the Run button — the same
  silence as a promptless AI column.

## Integration (Agent 3)

No new procedure to wire. `submitColumn` already carries the whole
`ColumnDraft` into `syncColumnCreate` / `syncColumnUpdate`; `config` rides
along, and `toModelColumn` reads it back.

## Decisions

- **Explicit picker, not a model-chosen column.** The alternative — put the
  whole row in and let the model spot the company name — needs no schema
  change, but it sends the row every time and makes the query
  non-deterministic. The client knows which column is the subject; asking is
  cheaper than inferring.
- **Several source columns, not one.** Usually just Company, but "Apex" needs
  Country to disambiguate. Same UI cost, and it avoids a second migration.
- **The model writes the query; the config fixes what it may see.** The
  difference between `Acme Corp` and `Acme Corp official website` is the
  difference between disambiguation and the answer — but the *scope* stays the
  client's choice.
- **Two Gemini calls, not one tool call.** See Risks: this was forced.
- **`config` is one `.strict()` object, not a discriminated union.** The
  discriminant would duplicate `node`, which the column already carries.
- **Runnability, not validation.** A search column with no source columns is
  allowed to exist and is skipped by Run, exactly like an AI column with no
  prompt. Half-finished is a normal state for a column being built.
- **A failed search fails the cell.** Unlike an attachment, which degrades to
  a note in the prompt. A "Google Search" node that answers without searching
  is worse than an empty cell.

## Risks / open questions

- **Can Gemini take tools and structured output in one call?** The AI SDK
  types say yes (`generateText` accepts `tools`, `stopWhen`, `prepareStep`
  *and* `output` together — `node_modules/ai/dist/index.d.ts:4844`). A spike
  against the real API before writing anything settled it: **no.**

  ```
  400 INVALID_ARGUMENT
  "Function calling with a response mime type: 'application/json' is unsupported"
  ```

  Forcing the tool (`toolChoice: "required"`) fails first and separately:
  *"Forced function calling (ANY mode) with a response mime type…"*. Since the
  tool could not be forced, a tool-shaped node could have answered from
  parametric memory without ever searching — so unrolling the loop is not a
  workaround here, it is the safer design. Ship: query call → SerpAPI → answer
  call.
- **Cost.** Two Gemini calls plus a SerpAPI call per cell. The query call is
  tiny (a few source cells in, one string out) and the answer call is smaller
  than an `ai` cell's, since the row is not in it.
- **Search results are untrusted web text.** They reach a model that writes a
  cell. The answering prompt labels them as data and forbids following
  instructions inside them; the value is then bounded by `cellOutputSchema`
  and `cellValueMatchesType`, and the node has no tools and no side effects, so
  the blast radius of a hostile page is a wrong cell value.

---

## Outcome

- **Shipped:**
  - `apps/api/prisma/schema.prisma` + migration `20260909225735_google_search_node`
  - `apps/api/src/modules/spreadsheet/`: `spreadsheet.schema.ts`
    (`NODE_TYPES_WIRE`, `nodeConfigSchema`, column in/out shapes),
    `spreadsheet-columns.service.ts`, `spreadsheet.shape.ts` (`toNodeConfig`),
    `spreadsheet.errors.ts` (`SpreadsheetConfigWithoutNodeError`)
  - `apps/api/src/modules/run-ai/`: `run-ai.schema.ts` (`target.node`,
    `input.search`, `result.searches`), `run-ai-batch.service.ts`,
    `run-ai.errors.ts` (`RunAiNoSearchInputError`)
  - `apps/api/src/ai/`: `serpapi.ts`, `search-prompt.ts`, `search-output.ts`
    (new); `cell-prompt.ts` exports `TYPE_RULES`; `cell-output.ts` exports
    `coerceCellValue`
  - `apps/api/src/trigger/run-ai-cell.ts` — the node switch
  - `apps/api/src/db/prisma.ts` — `toNullableJsonInput` (a nullable JSON column
    needs `Prisma.DbNull`, not `null`)
  - dashboard: `types.ts` (`NodeType`, `NodeConfig`), `cell-format.ts`,
    `run-targets.ts`, `use-sheet-model.ts`,
    `ai-spreadsheet-column-form.tsx`, `ai-spreadsheet-grid.tsx`,
    `messages/en.json`
- **Deviated:** the plan's first choice was one `generateText` with a
  `googleSearch` tool. Gemini refuses it (see Risks); `generateSearchCellValue`
  ships as two calls around one search, with a deterministic single retry
  using the source values verbatim when a query returns nothing.
- **Also found:** `previousOutput` spread the previous run's `target` into a
  `previous` *cell*, which silently smuggled the new `node` field into a cell
  shape. Caught by the existing chaining contract test; the fields are named
  explicitly now.
- **Not done:** the `email` node is still inert (unchanged by this plan). The
  search is fixed to `google` / `hl=en` / `gl=us`; per-column locale would be
  another `config` key. `credit` accounting is still not implemented, so a
  search cell costs the same nothing as an AI cell.
- **Docs updated:** [docs/features/run-ai.md](../features/run-ai.md),
  [docs/features/spreadsheet.md](../features/spreadsheet.md),
  [ARCHITECTURE.md](../../ARCHITECTURE.md) (env table + diagram),
  `apps/api/.env.example`, and both contract headers
  (`run-ai.api.test.ts`, `spreadsheet.api.test.ts`).
