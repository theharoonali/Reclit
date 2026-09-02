# `run-ai`

**Purpose:** one record per AI run against one cell — lifecycle status, credits
spent, the model result, and the batch the run was enqueued in — plus the live
stream the sheet paints its "working" capsules from. The substrate for
executing AI columns; nothing enqueues runs yet except the REST test endpoint.

**Contract:** `apps/api/src/__tests__/run-ai.api.test.ts` — payloads,
responses, events, and error codes live in its header. Do not duplicate them here.

## Table `RunAi`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `cellId` | `String` | scoped Cell pk `"<sheetId>.cell.<r>.<c>"`; plain string, **not** a fk; indexed |
| `spreadsheetId` | `String` | the sheet half of `cellId`, derived by the service on create; indexed with `updatedAt` |
| `batchId` | `String` | required; groups the runs one action enqueued; indexed |
| `status` | `String` | uppercase word: `PENDING \| RUNNING \| COMPLETED \| FAILED` or a custom working stage (`ANALYZING`, …); default `PENDING`. `COMPLETED` / `FAILED` are terminal |
| `credit` | `Int` | default 0 |
| `result` | `Json?` | object written by `complete` / `fail`; `result.output` is the cell value the run produced |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt`; its ms value is the SSE event id |

Indexes: `cellId`, `[spreadsheetId, updatedAt]`, `batchId`, `createdAt` ·
Relations: none — a run must outlive its cell (cleared cells are deleted rows;
import wipes every cell) · Migrations:
`apps/api/prisma/migrations/20260902013325_add_run_ai/`,
`apps/api/prisma/migrations/20260902125351_run_ai_status_text_and_feed/`.

Two things the Prisma schema cannot express live in the second migration (and
are invisible to `prisma migrate diff`, so they survive future migrations):

| Object | What it does |
| --- | --- |
| partial unique index `RunAi_active_cell_key` on `cellId WHERE status NOT IN ('COMPLETED','FAILED')` | one working run per cell, enforced by the database |
| function + trigger `run_ai_notify` (`AFTER INSERT OR UPDATE`) | `pg_notify('run_ai_changed', NEW.id)` — every writer, in any process, publishes |

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `RunAi` |
| `apps/api/src/modules/run-ai/run-ai.schema.ts` | schema | status rules (`isTerminalRunAiStatus`, wire/db case), `RunAi`, `RunAiChange`, every input |
| `apps/api/src/modules/run-ai/run-ai.errors.ts` | errors | `RunAiNotFoundError`, `RunAiCellBusyError`, `RunAiInvalidCellIdError` |
| `apps/api/src/modules/run-ai/run-ai.service.ts` | service | `create`, `setStatus`, `markRunning`, `complete`, `fail`, `byId`, `listByBatch`, `listActiveBySpreadsheet`, `listChangedSince`, `upsertForTest`, `changes` |
| `apps/api/src/modules/run-ai/run-ai.feed.ts` | feed | one `pg.Client` per process on `LISTEN run_ai_changed`; reconnects with backoff; framework-free |
| `apps/api/src/modules/run-ai/run-ai.controller.ts` | controller | `POST /run-ai/test` |
| `apps/api/src/modules/run-ai/run-ai.module.ts` | module | the controller + the feed's Nest lifecycle (start on boot, stop on shutdown) |
| `apps/api/src/trpc/routers/run-ai.ts` | router | `byId`, `listByBatch`, `listActive`, `onChange` (subscription) |
| `apps/api/src/modules/spreadsheet/spreadsheet.ids.ts` | ids | `parseCellId` — the inverse of `cellId`, shared with the spreadsheet |

Background jobs (not part of the tRPC graph — see
[ARCHITECTURE.md](../../ARCHITECTURE.md) "Background jobs"):

| Path | Responsibility |
| --- | --- |
| `apps/api/trigger.config.ts` | Trigger.dev project config (`runtime: "bun"`, `dirs: ["./src/trigger"]`) |
| `apps/api/src/ai/gemini.ts` | `gemini(modelId?)` — the one Gemini provider for the Vercel AI SDK |
| `apps/api/src/trigger/gemini-test.ts` | throwaway smoke task `gemini-test` (`{ prompt? }` → `{ text, usage }`) |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `runAi.byId` | query | `RunAiService.byId` | `RUN_AI_NOT_FOUND`, validation |
| `runAi.listByBatch` | query | `RunAiService.listByBatch` | validation |
| `runAi.listActive` | query | `RunAiService.listActiveBySpreadsheet` | validation |
| `runAi.onChange` | subscription (SSE) | `RunAiService.changes` | validation |

REST (`run-ai.controller.ts`):

| Route | Service method | Status |
| --- | --- | --- |
| `POST /run-ai/test` | `RunAiService.upsertForTest` | 201 created / 200 transitioned; 400, 404, 409 via `DomainErrorFilter` |

## Behaviour

- Status is lowercase on the wire and uppercase in the database;
  `toDbRunAiStatus` / `toWireRunAiStatus` in the schema file are the only
  mapping. Any single word is accepted; `completed` and `failed` are the only
  terminal values, and a run may not be created in one.
- **One working run per cell.** The partial unique index refuses a second
  non-terminal run for a `cellId`; the service maps the violation to
  `RunAiCellBusyError` (`RUN_AI_CELL_BUSY`, conflict) on create *and* on a
  transition that would revive a finished run.
- `create` derives `spreadsheetId` from `cellId` (`parseCellId`) and rejects
  anything that is not `<sheetId>.cell.<r>.<c>` with `RunAiInvalidCellIdError`.
  It never checks that the cell exists.
- `setStatus` is the general transition (custom stages included);
  `markRunning` and `fail` are thin wrappers. A `completed` status routes
  through `complete`.
- **`complete` writes the cell.** When `result.output` is present and not
  null it calls `spreadsheetCellsService.setCell` for the run's cell *before*
  flipping the status — the spreadsheet's rules apply (sheet and column must
  exist, the value must fit the column type) and a refused write leaves the
  run untouched, so the caller can retry. Without `output` only the run
  changes. `fail` never touches the cell.
- **The stream is a generation, not a socket.** A sheet streams exactly while
  it has a run that is not terminal: `listActive` tells a fresh page whether
  to subscribe (so a reload resumes a sheet mid-run), the sheet's Run button
  subscribes ahead of the first run, and when a terminal `run` event leaves
  the sheet with no working run the stream sends `{ type: "closed" }` as its
  last event and ends. Nothing is stored for this; the runs themselves are
  the state.
- **The live stream** (`changes` / `runAi.onChange`) is per sheet: subscribe
  to the feed first, replay every row with `updatedAt >= lastEventId` when
  the client reconnects (oldest first, ≤ 500), send a `snapshot` of the
  newest working run per cell, then one `run` event per change until
  `closed`. Events are `tracked`
  by `updatedAt` in ms (a snapshot by the sheet's newest `updatedAt`, `"0"`
  for an empty sheet); replay uses `>=`, so a reconnect may repeat one event
  and clients apply events idempotently. SSE pings every 15 s; a client that
  hears nothing for 45 s reconnects (`sse` options in `trpc/init.ts`).
- The feed resolves each notified id with one read per process and re-emits
  the row, so N subscribers cost one query per change. After a dropped
  listener reconnects it emits `resync` and every open stream re-sends its
  snapshot. The feed starts with the Nest app and lazily on first use (the
  tRPC caller in tests boots no Nest), and stops on shutdown.
- `listByBatch` returns `createdAt` ascending; an unknown batch is `[]`.
- `POST /run-ai/test`: `id` + `status` transitions that run; `cellId`
  addresses the cell — its working run is transitioned when a `status` is
  given (no `status` is a duplicate, 409), otherwise a run is created
  (`batchId` defaults to `test-<uuid>`) and a terminal `status` transitions
  it straight on. It exists so the stream can be driven by hand before real
  AI execution does; see the contract header for bodies and statuses.
- Every procedure is public; there is no auth yet.

## Reusable pieces

- `parseCellId` (`spreadsheet.ids.ts`) for anything holding a scoped cell id.
- `runAiFeed` + `RunAiService.changes` — the pattern for the next live table:
  a trigger that notifies ids, one listener, a per-scope async generator
  wrapped in `tracked()`.
- `gemini()` (`src/ai/gemini.ts`) for any service or task that needs a Gemini
  model; add other providers beside it in `src/ai/`.

## Used by

- [`/ai-spreadsheet`](../routes/ai-spreadsheet.md) — `listActive` decides
  on load whether to stream, the Run button opens the stream ahead of the
  first run, and `runAi.onChange` paints the working-run capsules and applies
  `result.output` when a run completes.
- AI-column execution (plan 011) is the intended writer; `POST /run-ai/test`
  stands in for it.
