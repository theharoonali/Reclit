# `run-ai`

**Purpose:** one record per AI run against one cell — status, credits, what the
run was given and what it produced, the batch it belongs to — plus the live
stream the sheet paints its "working" capsules from and the Trigger.dev tasks
that execute a batch: every selected row as a series, column by column.

**Contract:** `apps/api/src/__tests__/run-ai.api.test.ts` — payloads,
responses, stream events, error codes and every client-visible behaviour live
in its header. Do not duplicate them here.

## Table `RunAi`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `cellId` | `String` | scoped Cell pk `"<sheetId>.cell.<r>.<c>"`; plain string, **not** a fk; indexed |
| `spreadsheetId` | `String` | the sheet half of `cellId`, derived by the service on create; indexed with `updatedAt` |
| `batchId` | `String` | required; every run one Run click created (`batch-<uuid>`); indexed |
| `status` | `String` | uppercase word; `PENDING \| RUNNING \| COMPLETED \| FAILED` or a custom working stage; default `PENDING`; the two last are terminal |
| `credit` | `Int` | default 0 (credit accounting is not implemented; token usage is in `result.usage`) |
| `result` | `Json?` | null until the cell is prepared, then `input` (with `previous` from a row's second AI column on), `output`, `model`, `usage`, `attachments`, `error: { name, message }` — see the contract |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt`; its ms value is the SSE event id |

Indexes: `cellId`, `[spreadsheetId, updatedAt]`, `batchId`, `createdAt` ·
Relations: none — a run must outlive its cell (cleared cells are deleted rows;
import wipes every cell) · Migrations:
`apps/api/prisma/migrations/20260902013325_add_run_ai/`,
`apps/api/prisma/migrations/20260902125351_run_ai_status_text_and_feed/`.

The second migration holds what the Prisma schema cannot express (invisible to
`prisma migrate diff`, so it survives future migrations):

| Object | What it does |
| --- | --- |
| partial unique index `RunAi_active_cell_key` on `cellId WHERE status NOT IN ('COMPLETED','FAILED')` | one working run per cell, enforced by the database |
| function + trigger `run_ai_notify` (`AFTER INSERT OR UPDATE`) | `pg_notify('run_ai_changed', NEW.id)` — every writer, in any process, publishes |

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `RunAi` |
| `apps/api/src/modules/run-ai/run-ai.schema.ts` | schema | status rules (`isTerminalRunAiStatus`, wire/db case), `RunAi`, `RunAiInput` (+ `previous`), `RunAiJobPayload` (the cell task), `RunAiBatchJob` (the orchestrator: waves), `RunAiChange`, every input, the batch caps (`MAX_RUN_AI_BATCH_ROWS` 1000, `_COLUMNS` 256, `_CELLS` 5000) |
| `apps/api/src/modules/run-ai/run-ai.errors.ts` | errors | `RunAiNotFoundError`, `RunAiCellBusyError` (`cellIds`), `RunAiInvalidCellIdError`, `RunAiColumnNotRunnableError`, `RunAiBatchTooLargeError`, `RunAiDispatchError`, `RunAiFinishedError` |
| `apps/api/src/modules/run-ai/run-ai.service.ts` | service | the run lifecycle and the reads: `create`, `createMany`, `markRunning`, `setResult`, `setStatus`, `complete`, `fail`, `failPending`, `find`, `byId`, `listByBatch`, `listActiveBySpreadsheet`, `listChangedSince`, `latestEventId` |
| `apps/api/src/modules/run-ai/run-ai-batch.service.ts` | service | the batch, prisma-free: `setDispatcher`, `runCells` (plan → busy pre-check → one insert → waves → dispatcher), `prepare` (one cell's input from the database now, plus `previous`) |
| `apps/api/src/modules/run-ai/run-ai-changes.service.ts` | service | the live stream: `changes` (the `onChange` generator), the per-process pump that resolves feed notices into rows, the snapshot |
| `apps/api/src/modules/run-ai/run-ai.feed.ts` | feed | one `pg.Client` per process on `LISTEN run_ai_changed`; reconnects with backoff; framework-free |
| `apps/api/src/modules/run-ai/run-ai.module.ts` | module | the feed's Nest lifecycle (start on boot, stop on shutdown); no controller |
| `apps/api/src/trpc/routers/run-ai.ts` | router | `byId`, `listByBatch`, `listActive`, `runCells`, `onChange` (subscription) |
| `apps/api/src/modules/spreadsheet/spreadsheet.ids.ts` | ids | `parseCellId` — the inverse of `cellId`, shared with the spreadsheet |
| `apps/api/src/modules/spreadsheet/spreadsheet.service.ts` | service | `rowCells` — the sorted columns plus the row's cells an input is built from ([spreadsheet.md](spreadsheet.md)) |

Background jobs (outside the tRPC graph — [ARCHITECTURE.md](../../ARCHITECTURE.md)
"Background jobs"):

| Path | Responsibility |
| --- | --- |
| `apps/api/trigger.config.ts` | Trigger.dev project config (`runtime: "bun"`, `dirs: ["./src/trigger"]`, `prismaExtension({ mode: "modern" })`) |
| `apps/api/src/trigger/run-ai-batch.ts` | task `run-ai-batch` (`RunAiBatchJob`) — the skeleton of a Run click: per wave, `failPending` the cells of stopped rows → `prepare` the rest → `run-ai-cell` as `batchTriggerAndWait` (one cell: `triggerAndWait`) → a non-`completed` outcome stops the row; no retries; `onFailure` → `failPending` of every run |
| `apps/api/src/trigger/run-ai-cell.ts` | task `run-ai-cell` (`{ runId, input }`): `markRunning` → `generateCellValue` → `complete` / `fail`, returns `{ runId, status }`; no retries; `onFailure` fails the run |
| `apps/api/src/jobs/run-ai-dispatch.ts` | the API-side client: `registerRunAiDispatcher()` → `tasks.trigger("run-ai-batch", …, { idempotencyKey: batchId })`, the only `@trigger.dev/sdk` import on the API side; called from `src/main.ts` |
| `apps/api/src/ai/gemini.ts` | `gemini(modelId?)` — the one Gemini provider for the Vercel AI SDK |
| `apps/api/src/ai/cell-prompt.ts` | pure: `buildCellMessages` (instruction + row as context + the previous step's output as the primary input), `cellOutputSchema` (answer shape per column type), `formatCellLine` |
| `apps/api/src/ai/cell-attachments.ts` | fetches the row's audio / file / url cells into file parts (`collectAttachments`; ≤ 15 MB, 30 s each); a failure is recorded, never thrown |
| `apps/api/src/ai/cell-output.ts` | `generateCellValue` — `generateText` with the prompt plus the attached files, `Output.object` (or `Output.json` for `json` columns), validated with `cellValueMatchesType` |

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
  to the selected AI columns with a prompt, times the selected rows
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
  open stream re-sends its snapshot. The feed starts with the Nest app
  (`RunAiModule`) and lazily on first use (the tRPC caller in tests boots no
  Nest); the worker imports the service but never opens the feed.

## Reusable pieces

- `parseCellId` (`spreadsheet.ids.ts`) for anything holding a scoped cell id.
- `runAiFeed` + `RunAiChangesService` — the pattern for the next live table:
  a trigger that notifies ids, one listener, a per-scope async generator
  wrapped in `tracked()`.
- `setDispatcher` — the shape for any service that must reach a Trigger.dev
  task without importing the SDK; the client goes in `src/jobs/`.
- `failPending` — the guarded "fail whatever is still working" for any job
  that fans out and must clean up after a crash without touching finished
  rows; `run-ai-batch.ts` is the pattern for a parent task that prepares,
  fans out with `batchTriggerAndWait`, and reads per-run outcomes.
- `gemini()` (`src/ai/gemini.ts`) for any service or task that needs a Gemini
  model; add other providers beside it in `src/ai/`. `cellOutputSchema` /
  `cellValueMatchesType` for any other producer of typed cell values;
  `collectAttachments` for anything else that must hand a row's media to a
  model.

## Used by

- [`/ai-spreadsheet`](../routes/ai-spreadsheet.md) — the Run button calls
  `runCells` for the selected rectangle; `listActive` decides on load whether
  to stream; `runAi.onChange` paints the working-run capsules and applies
  `result.output` when a run completes.
- The `run-ai-batch` and `run-ai-cell` Trigger.dev tasks are the writers of
  every transition after `pending`.
