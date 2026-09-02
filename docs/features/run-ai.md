# `run-ai`

**Purpose:** one record per AI run against one cell — lifecycle status, credits
spent, the model result, and the batch the run was enqueued in. The
substrate for executing AI columns; nothing enqueues runs yet.

**Contract:** `apps/api/src/__tests__/run-ai.api.test.ts` — payloads,
responses, and error codes live in its header. Do not duplicate them here.

## Table `RunAi`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `cellId` | `String` | scoped Cell pk `"<sheetId>.cell.<r>.<c>"`; plain string, **not** a fk; indexed |
| `batchId` | `String` | required; groups the runs one action enqueued; indexed |
| `status` | `RunAiStatus` | `PENDING \| RUNNING \| COMPLETED \| FAILED`, default `PENDING` |
| `credit` | `Int` | default 0 |
| `result` | `Json?` | object written by `complete` / `fail`; null until then |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: `cellId`, `batchId`, `createdAt` · Relations: none — a run must
outlive its cell (cleared cells are deleted rows; import wipes every cell) ·
Migrations: `apps/api/prisma/migrations/20260902013325_add_run_ai/`

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `RunAi`, `RunAiStatus` |
| `apps/api/src/modules/run-ai/run-ai.schema.ts` | schema | wire/db status mapping, `RunAi`, inputs |
| `apps/api/src/modules/run-ai/run-ai.errors.ts` | errors | `RunAiNotFoundError` |
| `apps/api/src/modules/run-ai/run-ai.service.ts` | service | `create`, `markRunning`, `complete`, `fail`, `byId`, `listByBatch` |
| `apps/api/src/trpc/routers/run-ai.ts` | router | `byId`, `listByBatch` |

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

## Behaviour

- Status is lowercase on the wire (`"pending"` …) and uppercase in the
  database; `toDbRunAiStatus` / `toWireRunAiStatus` in the schema file are the
  only mapping.
- There are no write procedures. `create` (status `PENDING`, credit default 0),
  `markRunning`, `complete` (sets `result`, optionally `credit`) and `fail`
  (optionally sets `result`) are called in-process; each transition is one
  `update` and a missing id throws `RunAiNotFoundError`.
- `listByBatch` returns `createdAt` ascending; an unknown batch is `[]`, not
  an error.
- `cellId` is never validated against `Cell`; the cell may already be gone.
- Every procedure is public; there is no auth yet.

## Reusable pieces

- `gemini()` (`src/ai/gemini.ts`) for any service or task that needs a Gemini
  model; add other providers beside it in `src/ai/`.
- The wire/db status idiom — copy it for the next enum column rather than
  exposing Prisma enum types.

## Used by

- Nothing yet. AI-column execution (plan 011) is the intended caller.
