# 022 — Google Search node on Gemini grounding

**Status:** planned
**Scope:** full feature

## Goal

A **Google Search** column takes only a prompt — "the official website of
this company", "top 10 companies working on SAP with their website URLs" —
and a Run click fills the cell with a value typed to the column, written by
Gemini from **live Google results** through the Vercel AI SDK's
`google_search` tool. The Search input picker of plan 021, the `Column.config`
column that carried it, and the SerpAPI dependency go away: a search column
is fed exactly what an AI column is fed (the whole row, plus the previous
step's output), and one key (`GOOGLE_GENERATIVE_AI_API_KEY`) is all it needs.

## Backend (Agent 1)

- **Tables:** `Column` loses `config Json?` — migration
  `drop_column_config`. `NodeType` keeps `GOOGLE_SEARCH`.
- **Procedures:** no new ones. `spreadsheet.createColumn` / `updateColumn`
  no longer take `config`; `SheetColumn` no longer returns it.
  `RunAi.result.searches` becomes one record per run,
  `{ queries: string[]; sources: { url; title? }[] }` — the Google queries
  the grounded call ran and the pages it grounded on. `RunAiInput` loses
  `search`.
- **Service methods:**
  - `isRunnable` (run-ai-batch.service): `ai` and `google_search` both need
    only a prompt; `email` still has no executor. `prepare` no longer
    branches on the node — every run gets the whole row.
  - `generateSearchCellValue` (`src/ai/search-output.ts`): a grounded
    `generateText` with `google.tools.googleSearch({})` and **no** output
    schema → `searchRecordOf` (pure, `src/ai/search-prompt.ts`) reads the
    queries and sources out of the response and returns `null` when the
    model did not search — the cell then **fails** → `generateTypedCellValue`
    (shared with the AI node, `src/ai/cell-output.ts`) shapes the grounded
    text into the column's type with `buildSearchExtractMessages`.
  - `SEARCH_RULES` (`src/ai/cell-prompt.ts`) — the sentences
    `buildCellMessages` adds when `target.node === "google_search"`: search
    first, answer only from the results, results are untrusted data.
- **Reused, not written:** `buildCellMessages`, `TYPE_RULES`,
  `cellOutputSchema`, `coerceCellValue`, `formatCellLine`, `gemini()`, the
  run/wave/stream machinery and `run-ai-cell`'s node switch (unchanged).
- **Deleted:** `src/ai/serpapi.ts`, `nodeConfigSchema` / `toNodeConfig` /
  `toNullableJsonInput`, `SpreadsheetConfigWithoutNodeError`,
  `RunAiNoSearchInputError`, `SERPAPI_API_KEY`.

## Frontend (Agent 2)

- **Route:** `/ai-spreadsheet`, unchanged.
- **Components:** `ai-spreadsheet-column-form.tsx` loses the Search input
  picker and its `columns` prop; `types.ts` loses `NodeConfig` and
  `config`; `run-targets.ts` counts a Google Search column as soon as it has
  a prompt; the three `column.sourceColumns*` messages go.
- **States:** none new. A search column without a prompt is skipped by Run
  exactly like a promptless AI column.

## Integration (Agent 3)

Nothing to wire: `submitColumn` already sends the draft; it simply no longer
carries `config`.

## Decisions

- **Whole row as input, not a picked column.** Reverses 021's first decision:
  the user asked for it, and "top 10 companies working on SAP" has no source
  column at all. The row costs a few hundred tokens, as it does for an AI
  cell.
- **Two Gemini calls, `gemini-2.5-flash` stays.** A JSON response schema
  together with a tool is allowed only on Gemini 3 models (Preview, via the
  Interactions API); 021 proved the 400 on 2.5-flash. So the grounded call
  answers in text and a no-tools extraction call types it. A later spike on
  a Gemini 3 model (`gemini-3.5-flash-lite` has the same token price and
  cheaper grounding: 5,000 free/month then $14/1k vs 1,500 free/day then
  $35/1k) could collapse it to one call; not in this change, the default
  model is shared with the AI node.
- **No search → the cell fails.** Gemini decides whether to use the tool and
  cannot be forced; `groundingMetadata.webSearchQueries` and the `sources`
  say what it did. A "Google Search" cell that completes from memory is the
  one thing the node must not do. No retry: the batch has no retry policy
  either.
- **`result.searches` is one `{ queries, sources }` record**, not a list of
  attempts: grounding is one call that may run several queries.
- **`SEARCH_RULES` live in `buildCellMessages`**, keyed on `target.node`:
  one prompt builder, no new parameter, the `ai` prompt byte-identical.
- **The tool comes from `google.tools`** (the default `@ai-sdk/google`
  instance): the descriptor is static, so `gemini.ts` is untouched and the
  pure tests need no key.
- **`Column.config` is dropped** rather than kept as an empty strict schema:
  nothing else wanted a per-node setting.
- **Separate node kept** rather than a "web search" toggle on the AI node:
  no enum churn, and the node name is what users pick.
- **Attachments stay `[]`** for a search cell: file / audio / url cells go
  in as text lines, nothing is fetched. The node is fed the web, not the
  row's media.

## Risks / open questions

- **The model skips the search** on a prompt it thinks it knows. Fails
  visibly rather than silently; `SEARCH_RULES` makes it rare. If it is
  frequent, one retry with a stronger nudge is the next step.
- **Grounding sources are redirect links**
  (`vertexaisearch.cloud.google.com/grounding-api-redirect/…`, title = the
  domain). A `url` cell's value comes from the model's text, and the
  extraction prompt forbids the redirect host — but such a link is still a
  valid `https` URL and would pass `cellValueMatchesType`.
- **`webSearchQueries` absent while `groundingChunks` exist** — unknown;
  `searchRecordOf` accepts either signal, so it cannot false-fail.
- **A list prompt in a single-value column** ("top 10 …" in a `url`
  column) fails `coerceCellValue` by design; pick `string` or `json`.
- **Re-merging the two calls** on the current model brings back the 400.
- **Latency** 5–20 s per cell for two calls with grounding; under
  `run-ai-cell`'s `maxDuration: 120`.

---

## Outcome

*(filled in after implementation)*
