# `run-ai`

**Purpose:** one record per AI run against one cell — status, what the
run was given and what it produced, the batch it belongs to — plus the live
stream the sheet paints its "working" capsules from and the Trigger.dev tasks
that execute a batch: every selected row as a series, column by column.

**Contract:** `apps/api/src/__tests__/run-ai.api.test.ts` — payloads,
responses, stream events, error codes and every client-visible behaviour live
in its header. Do not duplicate them here.

## Table `AiRun` (kind `CELL`)

Cell runs are the `CELL` kind of the shared `AiRun` table (the assistant's
`ASSISTANT` runs and the dashboard generation's `DASHBOARD` runs are the other
two — [assistant.md](assistant.md),
[dashboard-generation.md](dashboard-generation.md)). Every `RunAiService`
query spreads `KIND` (`{ kind: "CELL" }`); a query without it would mix run
types. The columns a cell run uses:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `kind` | `AiRunKind` | `CELL` |
| `cellId` | `String?` | required for `CELL` (the `CHECK`); scoped Cell pk `"<sheetId>.cell.<r>.<c>"`; plain string, **not** a fk; indexed |
| `spreadsheetId` | `String?` | required for `CELL`; the sheet half of `cellId`, derived by the service on create; **not** a fk; indexed with `kind`, `updatedAt` |
| `batchId` | `String?` | required for `CELL`; every run one Run click created (`batch-<uuid>`); indexed |
| `status` | `String` | uppercase word; `PENDING \| RUNNING \| COMPLETED \| FAILED` or a custom working stage; default `PENDING`; the two last are terminal |
| `result` | `Json?` | null until the cell is prepared, then `input` (with `previous` from a row's second AI column on), `output`, `model`, `usage`, `attachments`, `transcripts`, `crawls`, `searches` (`google_search` only), `error: { name, message }` — see the contract |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt`; its ms value is the SSE event id |

Every other `AiRun` column (`workspaceId`, `source`, `scope`, `prompt`,
`phase`, `steps`, …) stays null on a cell run.

Indexes: `cellId`, `[kind, spreadsheetId, updatedAt]`, `batchId`, `createdAt`
· Relations: none for a cell run — it must outlive its cell (cleared cells are
deleted rows; import wipes every cell) and its sheet (`spreadsheetId` has no
fk) · Migration:
`apps/api/prisma/migrations/20261103180000_consolidate_tables/`.

That migration holds what the Prisma schema cannot express (invisible to
`prisma migrate diff`, so it survives future migrations):

| Object | What it does |
| --- | --- |
| `CHECK` `AiRun_kind_columns_check` | a `CELL` row has `cellId`, `spreadsheetId` and `batchId` |
| partial unique index `AiRun_active_cell_key` on `cellId WHERE kind = 'CELL' AND status NOT IN ('COMPLETED','FAILED')` | one working run per cell, enforced by the database |
| function + trigger `ai_run_notify` (`AFTER INSERT OR UPDATE`) | `pg_notify('run_ai_changed', NEW.id)` for a `CELL` row (`CASE kind`) — every writer, in any process, publishes |
| function + trigger `ai_run_spreadsheet_cascade` (`AFTER DELETE` on `Spreadsheet`) | deletes the sheet's `ASSISTANT` / `DASHBOARD` runs; cell runs are kept |

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `AiRun`, `AiRunKind` |
| `apps/api/src/modules/run-ai/run-ai.schema.ts` | schema | status rules (`isTerminalRunAiStatus`, wire/db case), `RunAi`, `RunAiInput` (+ `previous`), `RunAiJobPayload` (the cell task), `RunAiBatchJob` (the orchestrator: waves), `RunAiChange`, every input, the batch caps (`MAX_RUN_AI_BATCH_ROWS` 1000, `_COLUMNS` 256, `_CELLS` 5000) |
| `apps/api/src/modules/run-ai/run-ai.errors.ts` | errors | `RunAiNotFoundError`, `RunAiCellBusyError` (`cellIds`), `RunAiInvalidCellIdError`, `RunAiColumnNotRunnableError`, `RunAiBatchTooLargeError`, `RunAiDispatchError`, `RunAiFinishedError` |
| `apps/api/src/modules/run-ai/run-ai.service.ts` | service | the run lifecycle and the reads: `create`, `createMany`, `markRunning`, `setResult`, `setStatus`, `complete`, `fail`, `failPending`, `find`, `byId`, `listByBatch`, `listActiveBySpreadsheet`, `listChangedSince`, `latestEventId` |
| `apps/api/src/modules/run-ai/run-ai-batch.service.ts` | service | the batch, prisma-free: `setDispatcher`, `runCells` (plan → busy pre-check → one insert → waves → dispatcher), `runRow` (`runCells` for one row × every runnable column; `[]` when there is none), `prepare` (one cell's input from the database now, plus `previous`); exports `isRunnable` (a node with an executor and a prompt), which onboarding's `finish` filters with |
| `apps/api/src/modules/run-ai/run-ai-changes.service.ts` | service | the live stream: `changes` (the `onChange` generator), the per-process pump that resolves feed notices into rows, the snapshot |
| `apps/api/src/common/live-feed.ts` | common | `LiveFeed(channel, label)`: one `pg.Client` per process on `LISTEN <channel>`; pings it every 10 s and replaces a connection that stops answering; reconnects with backoff, emits `resync`; framework-free; shared with the assistant |
| `apps/api/src/modules/run-ai/run-ai.feed.ts` | feed | `runAiFeed = new LiveFeed("run_ai_changed", "run-ai")` |
| `apps/api/src/modules/run-ai/run-ai.module.ts` | module | the feed's Nest lifecycle (start on boot, stop on shutdown); no controller |
| `apps/api/src/trpc/routers/run-ai.ts` | router | `byId`, `listByBatch`, `listActive`, `runCells`, `onChange` (subscription) |
| `apps/api/src/modules/spreadsheet/spreadsheet.ids.ts` | ids | `parseCellId` — the inverse of `cellId`, shared with the spreadsheet |
| `apps/api/src/modules/spreadsheet/spreadsheet.service.ts` | service | `rowCells` — the sorted columns plus the row's cells an input is built from ([spreadsheet.md](spreadsheet.md)) |

Background jobs (outside the tRPC graph — [ARCHITECTURE.md](../../ARCHITECTURE.md)
"Background jobs"):

| Path | Responsibility |
| --- | --- |
| `apps/api/trigger.config.ts` | Trigger.dev project config (`runtime: "bun"`, `dirs: ["./src/trigger"]`, `prismaExtension({ mode: "modern" })`) |
| `apps/api/src/trigger/run-ai-batch.ts` | task `run-ai-batch` (`RunAiBatchJob`) — the skeleton of a Run click: per wave, `failPending` the cells of stopped rows → `prepare` the rest → `run-ai-cell` as `batchTriggerAndWait` (one cell: `triggerAndWait`) → a non-`completed` outcome stops the row; no retries; `onFailure` → `failPending` of every run. Before each wave it asks `ensureCompanyCache` for the sheet owner's company ([company.md](company.md)) and passes the name as `cacheName` in every cell payload |
| `apps/api/src/trigger/run-ai-cell.ts` | task `run-ai-cell` (`{ runId, input, cacheName? }`): `markRunning` → the company context (`companyContextService.forSpreadsheet`, null on any error) → `generateCellValue` (given the run's parsed cell address and a crawl resolver that `batchTriggerAndWait`s `crawl-website` for the row's url cells) or `generateSearchCellValue` or `generateEmailCellValue` (`input.target.node` decides) → `complete` / `fail` (a failed `complete` keeps the generator's extras, e.g. `result.emails`), returns `{ runId, status }`; no retries, `maxDuration` 300 s of CPU time (a transcription may precede the model call; the wait for crawls is free); `onFailure` fails the run |
| `apps/api/src/trigger/crawl-website.ts` | task `crawl-website` (`{ cellId, url }` → `{ recordId, reused, pages, characters }`): the general Firecrawl crawl into `ExternalApi`, one at a time on the shared `firecrawl` queue (`firecrawl-queue.ts`, also `crawl-company`), retried with backoff ([external-api.md](external-api.md)) |
| `apps/api/src/jobs/run-ai-dispatch.ts` | the API-side client: `registerRunAiDispatcher()` → `tasks.trigger("run-ai-batch", …, { idempotencyKey: batchId })`, the only `@trigger.dev/sdk` import on the API side; called from `src/main.ts` |
| `apps/api/src/ai/model.ts` | the one AI provider for the Vercel AI SDK and the only file that names the vendor: `aiModel(modelId?)`, `defaultModelId()` (`AI_MODEL`, else the provider default), `isAiConfigured()`, `AI_KEY_ENV`, `webSearchTools()` / `webSearchQueries()` (the search node), `cachedContentOptions()` / `promptCacheApi` (the explicit prompt cache) |
| `apps/api/src/ai/search-prompt.ts` | pure: `buildSearchExtractMessages` (the grounded text → the typed value), `searchRecordOf` (the grounded call's queries and pages, or `null` when it did not search), `MAX_SEARCH_SOURCES` |
| `apps/api/src/ai/search-output.ts` | `generateSearchCellValue` — the `google_search` node: a grounded model call with the provider's web-search tool (`webSearchTools()`), the did-it-search check, then the typed extraction call |
| `apps/api/src/ai/cell-prompt.ts` | pure: `buildCellMessages(input, notes, company?)` → `{ system, prompt, cachedPrompt }` (the company block, `CELL_PREAMBLE`, then the instruction + row as context + the previous step's output as the primary input; plus `SEARCH_RULES` for a `google_search` target; `cachedPrompt` is the instruction + row for a call on an explicit cache), `cachedCellSystem` (what that cache holds), `cellOutputSchema` (answer shape per column type), `TYPE_RULES`, `formatCellLine`, `CellSourceNote` (attached / transcribed / failed) |
| `apps/api/src/ai/cell-attachments.ts` | fetches the row's file cells into file parts (`collectAttachments`; ≤ 15 MB, 30 s each); a failure is recorded, never thrown. `isUrlCell`, `fetchFile` / `fetchAttachment`, `filenameOf` and `mediaTypeFor` are shared (`fetchFile` and `mediaTypeFor` also with the company documents) with the transcript and crawl paths |
| `apps/api/src/ai/cell-transcripts.ts` | resolves the row's audio cells to text through `ExternalApi` + ElevenLabs ([external-api.md](external-api.md)); a failure is recorded, never thrown |
| `apps/api/src/ai/cell-crawls.ts` | resolves the row's url cells to crawled pages through `ExternalApi` + Firecrawl (`firecrawl.ts`, the `crawl-website` task — [external-api.md](external-api.md)); `formatCrawledPages` budgets what the prompt gets; a failure is recorded, never thrown |
| `apps/api/src/ai/resend.ts` | `sendEmail` — the Resend send-email call (raw `fetch`, key read per call, `RESEND_FROM` defaulting to `Reclit <hello@reclit.com>`, `Idempotency-Key`) |
| `apps/api/src/ai/email-prompt.ts` | pure: `findEmailAddresses` + `emailRecipients` (addresses from the prompt and any cell, target cell excluded, capped at `MAX_EMAIL_RECIPIENTS`), `emailDraftSchema` (a draft list), `resolveRecipient`, `emailCellValue` (`{address: "Subject: …" \| "FAILED"}`) |
| `apps/api/src/ai/email-output.ts` | `generateEmailCellValue` — the `email` node: recipients → one draft-list call → per-draft checks → sequential sends with per-address idempotency, failures recorded as FAILED, run still completed |
| `apps/api/src/ai/cell-output.ts` | `generateCellValue(input, address, deps, { company, cacheName })` — attachments, transcripts and crawls in parallel, then `cellCalls` (the implicit call, and the cached one when there is a cache) through `withCacheFallback` into `generateTypedCellValue`; `cellUsage` (adds `cachedInputTokens`); the one typed-output call both generators end on (`Output.object`, or `Output.json` for `json` columns, then `coerceCellValue` / `cellValueMatchesType`) |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `runAi.byId` | query | `RunAiService.byId` | `RUN_AI_NOT_FOUND`, validation |
| `runAi.listByBatch` | query | `RunAiService.listByBatch` | validation |
| `runAi.listActive` | query | `RunAiService.listActiveBySpreadsheet` | validation |
| `runAi.runCells` | mutation | `RunAiBatchService.runCells` | `RUN_AI_COLUMN_NOT_RUNNABLE`, `RUN_AI_BATCH_TOO_LARGE`, `SPREADSHEET_NOT_FOUND`, `RUN_AI_CELL_BUSY`, `RUN_AI_DISPATCH_FAILED`, validation |
| `runAi.onChange` | subscription (SSE) | `RunAiChangesService.changes` | validation |

There is no REST face.

## Behaviour

- **The dispatcher is a hook.** `src/modules/**` may not import
  `@trigger.dev/sdk`, so `RunAiBatchService.setDispatcher` is registered by
  `src/jobs/run-ai-dispatch.ts` from `src/main.ts` — not from `bootstrap.ts`,
  which the test suite boots. Without a dispatcher the runs stay `pending`; a
  dispatcher that throws `failPending`s the whole batch and the call answers
  `RunAiDispatchError`.
- **`runCells` records the batch, the worker builds the inputs.** The
  service plans the targets — `columnsOf` (the one ordering point) filtered
  to the selected *runnable* columns, times the selected rows
  ascending — checks the caps, names any busy cell from
  `listActiveBySpreadsheet`, and inserts every run `pending` with
  `result: null` in one `createManyAndReturn` (all or nothing; the rows are
  matched back to the plan by `cellId`, never by the statement's order), so
  the inserts' triggers reach the sheet before the worker is asked. The
  dispatcher gets the targets regrouped as **waves**: one per AI column in
  `sortOrder`, one cell per row.
- **A wave is prepared, then run.** `run-ai-batch` walks the waves; for each
  cell `RunAiBatchService.prepare` reads the run (a finished one is reported,
  not re-prepared), `columnOrThrow` (still `node: "ai"` with a prompt),
  `rowCells` + `buildRowCells` — the row *as the database holds it now*, so
  the earlier columns' answers are in it — and, from the row's second AI
  column on, the previous run's `result.output` with its `result.input.target`
  as `previous`; `setResult` stores `{ input }` on the still-`pending` run.
  Then the wave runs as one `batchTriggerAndWait` of `run-ai-cell` (a single
  `triggerAndWait` when it has one cell); the parent waits for it, and the
  wait costs no `maxDuration`. A cell whose outcome is not `completed` stops
  its row: the row's cells in the later waves are `failPending`ed with
  `RunAiSeriesStopped` and skipped.
- **A Google Search column is fed the row, like an AI column.** `isRunnable`
  is a per-node switch: `ai` and `google_search` need a prompt, `email` needs
  a prompt and a `json` column (create/update enforce json for Mail columns —
  `SPREADSHEET_EMAIL_COLUMN_TYPE` — so only a legacy string one is skipped
  here). `prepare` builds one input shape for
  every node — the whole row plus `previous`; the prompt is the whole
  configuration of a search column ("the official website of this company",
  "top 10 companies working on SAP with their URLs"), so a blank row still
  prepares.
- **The search node is a grounded call plus an extraction call.** The
  provider rejects a tool alongside a JSON response schema on the model in
  use — *"Function calling with a response mime type: 'application/json' is
  unsupported"* — so
  `generateSearchCellValue` unrolls it: one `generateText` with the
  provider's web-search tool (`webSearchTools()`, keyed `google_search`) and
  no output schema (`buildCellMessages`
  adds `SEARCH_RULES` for a `google_search` target), then
  `generateTypedCellValue` shapes the grounded text through the same
  `cellOutputSchema` an `ai` cell uses (`buildSearchExtractMessages`). The
  model decides whether to search and cannot be forced, so `searchRecordOf`
  reads the searched queries (`webSearchQueries()`, `ai/model.ts`) and the
  `sources` first: nothing there
  fails the cell — a Google Search cell never completes from memory. The
  queries and pages land in `result.searches` (source URLs are Google
  redirect links, `title` the domain); `result.attachments` is always `[]`
  and `result.usage` is both calls summed.
- **A Mail (`email`) column sends real email, personalized per recipient.**
  `generateEmailCellValue` (`src/ai/email-output.ts`) collects the allowed
  addresses from the column's prompt and every cell's content
  (`emailRecipients`: target cell excluded, deduped case-insensitively, first
  spelling kept, capped at `MAX_EMAIL_RECIPIENTS` = 10), asks the model once for
  a draft list (`Output.object`, no tools; `buildCellMessages` swaps the
  "Answer with …" line for `EMAIL_RULES` plus the allowed recipients), drops
  any draft whose `to` the list does not hold (`resolveRecipient`), is a
  duplicate, or has an empty subject/body, and fails the run before any send
  when no address exists or no draft survives. The surviving drafts are sent
  one by one through Resend (`sendEmail`, `src/ai/resend.ts`), idempotency
  key `<runId>:<address lowercase>`; a failed send records
  `status: "failed"` on that entry and the run still completes. The cell
  gets `{address: "Subject: …\n\n…" | "FAILED"}` and the run
  `result.emails`; when `complete` fails after the sends, `run-ai-cell`
  fails the run with the generator's extras, so `result.emails` survives.
  Mail cells are machine-written by runs but editable like any json cell —
  the dashboard blocks accidental inline edits and edits them deliberately
  through its cell dialog. Media is not resolved: file/audio/url
  cells reach the model as text, as for search. Because `isRunnable` gates
  `runRow` and onboarding too, a mail column also sends on every public form
  submission and in onboarding's `finish`.
- **One working run per cell is a database rule**, not a service check: the
  partial unique index refuses the insert (or a transition that would revive
  a finished run while another works the cell) and `create` / `createMany` /
  `update` map the violation to `RunAiCellBusyError`. `markRunning` and
  `setResult` are guarded `updateMany`s on non-terminal rows, so a finished
  run is never revived; `failPending` is the same guard in the other
  direction, so a crash of the orchestrator (`onFailure`) or a late cascade
  can never flip a completed step.
- **`complete` writes the cell before the run.** With a non-null
  `result.output` it calls `spreadsheetCellsService.setCell` first — the
  spreadsheet's own rules apply and a refused write leaves the run untouched
  — so the `completed` event always describes a persisted cell and a partial
  failure is retry-safe. `fail` never touches the cell.
- **The row's media takes three paths, and none can fail a run.** `file`
  cells are fetched and attached to the model call as files
  (`collectAttachments`). `audio` cells are transcribed instead
  (`collectTranscripts`), and `url` cells are crawled (`collectCrawls`):
  each one is resolved through `externalApiService.resolve` under **its
  own** cell id — same sheet, same row, its column, which is why the task
  parses the run's `cellId` — and its URL, so a stored transcript or crawl
  is reused and the recording or the site is paid for once no matter how many
  AI columns the row runs through; a crawl is also reused from any other cell
  holding the same URL (`anyCell`). The crawl itself is a `crawl-website`
  child run per url cell (`batchTriggerAndWait`, one crawl at a time on the
  Firecrawl free plan) that the cell task waits for, free of `maxDuration`.
  The prompt line then carries the transcript rather than the URL, or points
  at the crawled pages that follow the row (60,000 characters per url cell,
  8,000 per page, the rest counted as omitted). Any path failing becomes a
  note in that line, and the completed run records all three without their
  content (`result.attachments`, `result.transcripts`, `result.crawls`).
- **Company context and caching.** Every cell's system instruction starts
  with the sheet owner's `<company-context>` block and `CELL_PREAMBLE`, the
  same bytes for every cell of a profile version, so the provider's implicit
  prefix cache serves them. With a `cacheName` (an explicit cache of exactly
  that prefix, [company.md](company.md)) the `ai` and `email` calls pass
  `cachedContentOptions(cacheName)` and send no `system` — the provider
  answers 400 to a system instruction next to a cache —
  and open the user message with the column's instruction
  (`cachedPrompt`); any failure of the cached call is retried on the
  implicit path, so a cache can never fail a cell. `google_search` cells use
  the implicit path only (a tool cannot run on a cache). `result.usage`
  carries `cachedInputTokens` from `usage.inputTokenDetails.cacheReadTokens`.
- **The task owns every transition after `pending`** and has no retries: a
  retry after `fail` would revive a terminal row. `onFailure` covers the
  crash paths the catch cannot see (a `maxDuration` kill). The answer is
  validated with `cellValueMatchesType` before `complete`, so a run never
  completes with a value its cell would refuse.
- **The stream is derived, not stored.** `RunAiChangesService.changes`
  subscribes to the feed *before* reading (nothing slips between snapshot and
  first live event), replays by `updatedAt` range, and ends itself with
  `closed` when a terminal event leaves `listActiveBySpreadsheet` empty.
  Event ids are database timestamps, never this process's clock.
- **One read per change per process.** The feed emits row ids; the changes
  service's pump resolves each id once with `RunAiService.find` and re-emits
  the row to every open generator. A reconnected feed emits `resync` and every
  open stream does what a reconnecting client's `lastEventId` does: replays the
  runs touched since the last event it sent, then re-sends its snapshot — so a
  run that finished while the feed was down still delivers its output. A feed
  whose connection goes silent is detected by a 10 s ping and replaced
  (`src/__tests__/live-feed.test.ts` stages exactly that). The feed starts with the Nest app
  (`RunAiModule`) and lazily on first use (the tRPC caller in tests boots no
  Nest); the worker imports the service but never opens the feed.

## Reusable pieces

- `parseCellId` (`spreadsheet.ids.ts`) for anything holding a scoped cell id.
- `LiveFeed` (`src/common/live-feed.ts`) + `RunAiChangesService` — the
  pattern for the next live table: a trigger that notifies ids, one listener
  per channel, a per-scope async generator wrapped in `tracked()`. The
  assistant ([assistant.md](assistant.md)) is the second instance.
- `setDispatcher` — the shape for any service that must reach a Trigger.dev
  task without importing the SDK; the client goes in `src/jobs/`.
- `failPending` — the guarded "fail whatever is still working" for any job
  that fans out and must clean up after a crash without touching finished
  rows; `run-ai-batch.ts` is the pattern for a parent task that prepares,
  fans out with `batchTriggerAndWait`, and reads per-run outcomes.
- `aiModel()` (`src/ai/model.ts`) for any service or task that needs a
  language model — never import the vendor SDK elsewhere; `isAiConfigured()`
  for a 503 guard; `transcribeAudio` (`src/ai/elevenlabs.ts`) for speech-to-text,
  `crawlWebsite` (`src/ai/firecrawl.ts`) for a site's pages, `sendEmail`
  (`src/ai/resend.ts`) to send an email; add other
  providers beside them in `src/ai/`. `generateTypedCellValue` /
  `cellOutputSchema` / `coerceCellValue` for any other producer of typed
  cell values; `collectAttachments` for anything else that must hand a row's
  media to a model, and `externalApiService.resolve` ([external-api.md](external-api.md))
  for anything that must not process the same source twice.
- The `crawl-website` task — trigger it with `{ cellId, url }` from any task
  that needs a website's content, then read the record by id; the store, not
  the task, is where the pages live.
- `searchRecordOf` (`src/ai/search-prompt.ts`) — the shape for reading a
  provider-executed tool's metadata: pure, structural over `result.sources`,
  and answering "did it happen" so the caller can refuse an answer that
  skipped the tool.
- `input.target.node` + the switch in `run-ai-cell.ts` — the seam a third
  node type plugs into: register it in `NODE_TYPES_WIRE`, teach `isRunnable`
  what it needs, add a generator returning `CellGeneration`.

## Used by

- The `populate` feature ([populate.md](populate.md)) — `runRow` after a
  submission saved its row, so a form or API submission fills its AI cells.
- [`/ai-spreadsheet`](../routes/ai-spreadsheet.md) — the Run button calls
  `runCells` for the selected rectangle; `listActive` decides on load whether
  to stream; `runAi.onChange` paints the working-run capsules and applies
  `result.output` when a run completes.
- The `run-ai-batch` and `run-ai-cell` Trigger.dev tasks are the writers of
  every transition after `pending`.
- The `generate-dashboard` task
  ([dashboard-generation.md](dashboard-generation.md)) reads `listByBatch`
  while it waits for the onboarding batch to finish.
