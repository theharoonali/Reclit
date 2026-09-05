# `run-ai`

**Purpose:** one record per AI run against one cell — status, credits, what the
run was given and what it produced, the batch it belongs to — plus the live
stream the sheet paints its "working" capsules from and the Trigger.dev task
that executes a run.

**Contract:** `apps/api/src/__tests__/run-ai.api.test.ts` — payloads,
responses, stream events, error codes and every client-visible behaviour live
in its header. Do not duplicate them here.

## Table `RunAi`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `cellId` | `String` | scoped Cell pk `"<sheetId>.cell.<r>.<c>"`; plain string, **not** a fk; indexed |
| `spreadsheetId` | `String` | the sheet half of `cellId`, derived by the service on create; indexed with `updatedAt` |
| `batchId` | `String` | required; groups the runs one action enqueued (`run-<uuid>`, one run per batch today); indexed |
| `status` | `String` | uppercase word; `PENDING \| RUNNING \| COMPLETED \| FAILED` or a custom working stage; default `PENDING`; the two last are terminal |
| `credit` | `Int` | default 0 (credit accounting is not implemented; token usage is in `result.usage`) |
| `result` | `Json?` | `input`, `output`, `model`, `usage`, `attachments`, `error: { name, message }` — see the contract |
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
| `apps/api/src/modules/run-ai/run-ai.schema.ts` | schema | status rules (`isTerminalRunAiStatus`, wire/db case), `RunAi`, `RunAiInput`, `RunAiJobPayload`, `RunAiChange`, every input |
| `apps/api/src/modules/run-ai/run-ai.errors.ts` | errors | `RunAiNotFoundError`, `RunAiCellBusyError`, `RunAiInvalidCellIdError`, `RunAiColumnNotRunnableError`, `RunAiDispatchError`, `RunAiFinishedError` |
| `apps/api/src/modules/run-ai/run-ai.service.ts` | service | the run lifecycle: `setDispatcher`, `runCell`, `create`, `markRunning`, `setStatus`, `complete`, `fail`, `find`, `byId`, `listByBatch`, `listActiveBySpreadsheet`, `listChangedSince`, `latestEventId` |
| `apps/api/src/modules/run-ai/run-ai-changes.service.ts` | service | the live stream: `changes` (the `onChange` generator), the per-process pump that resolves feed notices into rows, the snapshot |
| `apps/api/src/modules/run-ai/run-ai.feed.ts` | feed | one `pg.Client` per process on `LISTEN run_ai_changed`; reconnects with backoff; framework-free |
| `apps/api/src/modules/run-ai/run-ai.module.ts` | module | the feed's Nest lifecycle (start on boot, stop on shutdown); no controller |
| `apps/api/src/trpc/routers/run-ai.ts` | router | `byId`, `listByBatch`, `listActive`, `runCell`, `onChange` (subscription) |
| `apps/api/src/modules/spreadsheet/spreadsheet.ids.ts` | ids | `parseCellId` — the inverse of `cellId`, shared with the spreadsheet |
| `apps/api/src/modules/spreadsheet/spreadsheet.service.ts` | service | `rowCells` — the sorted columns plus the row's cells an input is built from ([spreadsheet.md](spreadsheet.md)) |

Background jobs (outside the tRPC graph — [ARCHITECTURE.md](../../ARCHITECTURE.md)
"Background jobs"):

| Path | Responsibility |
| --- | --- |
| `apps/api/trigger.config.ts` | Trigger.dev project config (`runtime: "bun"`, `dirs: ["./src/trigger"]`, `prismaExtension({ mode: "modern" })`) |
| `apps/api/src/trigger/run-ai-cell.ts` | task `run-ai-cell` (`{ runId, input }`): `markRunning` → `generateCellValue` → `complete` / `fail`; no retries; `onFailure` fails the run |
| `apps/api/src/jobs/run-ai-dispatch.ts` | the API-side client: `registerRunAiDispatcher()` → `tasks.trigger("run-ai-cell", …)`, the only `@trigger.dev/sdk` import on the API side; called from `src/main.ts` |
| `apps/api/src/ai/gemini.ts` | `gemini(modelId?)` — the one Gemini provider for the Vercel AI SDK |
| `apps/api/src/ai/cell-prompt.ts` | pure: `buildCellMessages` (instruction + row as context), `cellOutputSchema` (answer shape per column type), `formatCellLine` |
| `apps/api/src/ai/cell-attachments.ts` | fetches the row's audio / file / url cells into file parts (`collectAttachments`; ≤ 15 MB, 30 s each); a failure is recorded, never thrown |
| `apps/api/src/ai/cell-output.ts` | `generateCellValue` — `generateText` with the prompt plus the attached files, `Output.object` (or `Output.json` for `json` columns), validated with `cellValueMatchesType` |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `runAi.byId` | query | `RunAiService.byId` | `RUN_AI_NOT_FOUND`, validation |
| `runAi.listByBatch` | query | `RunAiService.listByBatch` | validation |
| `runAi.listActive` | query | `RunAiService.listActiveBySpreadsheet` | validation |
| `runAi.runCell` | mutation | `RunAiService.runCell` | `RUN_AI_COLUMN_NOT_RUNNABLE`, `SPREADSHEET_NOT_FOUND`, `SPREADSHEET_COLUMN_NOT_FOUND`, `RUN_AI_CELL_BUSY`, `RUN_AI_DISPATCH_FAILED`, validation |
| `runAi.onChange` | subscription (SSE) | `RunAiChangesService.changes` | validation |

There is no REST face.

## Behaviour

- **The dispatcher is a hook.** `src/modules/**` may not import
  `@trigger.dev/sdk`, so `RunAiService.setDispatcher` is registered by
  `src/jobs/run-ai-dispatch.ts` from `src/main.ts` — not from `bootstrap.ts`,
  which the test suite boots. Without a dispatcher a run stays `pending`; a
  dispatcher that throws fails the run and the call answers
  `RunAiDispatchError`.
- **`runCell` builds the input from the database**, not the request:
  `columnOrThrow` (the column must be `node: "ai"` with a prompt) then
  `rowCells` + `buildRowCells` (every column in `sortOrder`, blanks `null`).
  The run is created with `result: { input }` first, so the insert's trigger
  reaches the sheet before the worker is even asked.
- **One working run per cell is a database rule**, not a service check: the
  partial unique index refuses the insert (or a transition that would revive
  a finished run while another works the cell) and `create` / `update` map the
  violation to `RunAiCellBusyError`. `markRunning` is a guarded `updateMany`
  on non-terminal rows, so a finished run is never revived.
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
- `gemini()` (`src/ai/gemini.ts`) for any service or task that needs a Gemini
  model; add other providers beside it in `src/ai/`. `cellOutputSchema` /
  `cellValueMatchesType` for any other producer of typed cell values;
  `collectAttachments` for anything else that must hand a row's media to a
  model.

## Used by

- [`/ai-spreadsheet`](../routes/ai-spreadsheet.md) — the Run button calls
  `runCell` for the selected AI cell; `listActive` decides on load whether to
  stream; `runAi.onChange` paints the working-run capsules and applies
  `result.output` when a run completes.
- The `run-ai-cell` Trigger.dev task is the writer of every transition after
  `pending`.
