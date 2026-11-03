# `dashboard-generation`

**Purpose:** one record per AI-built dashboard — started from the onboarding
wizard or the empty dashboard's "AI Recommendations" pill — with the phases
the Trigger.dev task goes through (analyze → propose → lay out → verify →
retry once → apply), the brief it wrote, what it applied and why, and the live
stream the progress UI paints from.

**Contract:** `apps/api/src/__tests__/dashboard-generation.api.test.ts` —
payloads, responses, stream events, the log/brief/result shapes, error codes
and every client-visible behaviour live in its header. Do not duplicate them
here.

## Table `AiRun` (kind `DASHBOARD`)

Dashboard generations are the `DASHBOARD` kind of the shared `AiRun` table
([run-ai.md](run-ai.md) has the table's `CELL` side,
[assistant.md](assistant.md) its `ASSISTANT` side). Every
`DashboardGenerationService` query spreads `KIND` (`{ kind: "DASHBOARD" }`).
The columns a generation uses (the rest stay null):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `kind` | `AiRunKind` | `DASHBOARD` |
| `workspaceId` | `String?` | required for `DASHBOARD` (the `CHECK`); fk cascade → `Workspace`; indexed with `kind`, `updatedAt` |
| `spreadsheetId` | `String?` | required for `DASHBOARD`; the workspace's sheet, resolved by `start`; no fk — the `ai_run_spreadsheet_cascade` trigger deletes the generation with its sheet |
| `source` | `AiRunSource?` | required for `DASHBOARD`; `ONBOARDING` or `DASHBOARD` (the enum's `USER` / `SYSTEM` belong to assistant runs); lowercase on the wire |
| `status` | `String` | uppercase word; `PENDING RUNNING COMPLETED FAILED CANCELLED`; the last three are terminal |
| `phase` | `String?` | required for `DASHBOARD`; uppercase word; `QUEUED WAITING_FOR_ROWS ANALYZING PROPOSING LAYING_OUT VERIFYING RETRYING APPLYING DONE` |
| `attempt` | `Int?` | required for `DASHBOARD`; the proposal round, 0 before the first, then 1 or 2 |
| `awaitBatchId` | `String?` | the onboarding run-ai batch the task waits for before analyzing; null from the pill |
| `steps` | `Json?` | required for `DASHBOARD`; the log — `GenerationStep[]`, written `[]` on create, one entry per phase per attempt (`phase`, `attempt`, `status`, `detail`, timestamps); the service maps it to `log` on the wire |
| `brief` | `Json?` | the strict-parsed `DashboardBrief` (subject, questions, a use per column) |
| `result` | `Json?` | `GenerationResult`: `cardCount`, `applied`, `attempts`, the applied attempt's `issues`, the `review`, `reason` (`ok` / `no_value`) |
| `error` | `Json?` | `{ name, message }` via `describeError` |
| `model` / `usage` | `String?` / `Json?` | the model id and the summed token usage of every call (`cachedInputTokens` once any call reported it) |
| `triggerRunId` | `String?` | the Trigger.dev run id, stored after `tasks.trigger`; what `cancel` hands to `runs.cancel`; never selected |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt`; its ms value is the SSE event id |

Indexes: `[kind, workspaceId, updatedAt]`, `[createdAt]` · Relations:
`Workspace.aiRuns[]` (cascade) · Migration:
`apps/api/prisma/migrations/20261103180000_consolidate_tables/`, which also
holds what the Prisma schema cannot express:

| Object | What it does |
| --- | --- |
| `CHECK` `AiRun_kind_columns_check` | a `DASHBOARD` row has `workspaceId`, `spreadsheetId`, `source`, `phase`, `attempt` and `steps` |
| partial unique index `AiRun_active_dashboard_key` on `workspaceId WHERE kind = 'DASHBOARD' AND status NOT IN ('COMPLETED','FAILED','CANCELLED')` | one active generation per workspace, enforced by the database (`DASHBOARD_GENERATION_BUSY`) |
| function + trigger `ai_run_notify` (`AFTER INSERT OR UPDATE`) | `pg_notify('dashboard_generation_changed', NEW.id)` for a `DASHBOARD` row (`CASE kind`) — every writer, in any process, publishes |
| function + trigger `ai_run_spreadsheet_cascade` (`AFTER DELETE` on `Spreadsheet`) | deletes the sheet's generations with it |

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `AiRun`, `AiRunKind`, `AiRunSource` |
| `packages/dashboard-engine/src/verify.ts` (+ `verify-query.ts`) | engine | `verifyDashboard(cards, payload, profile)` → `VerifyIssue[]` (`QUERY_INVALID EMPTY_RESULT SINGLE_GROUP ALL_NULL TOO_MANY_SLICES TOO_MANY_CATEGORIES LONG_LABELS CONSTANT_SERIES NON_MEASURE_AGGREGATE ID_COUNT_STAT DUPLICATE_CARD`, each `error` or `warn`), `verifyLayout` (`ROW_UNDERFILLED` + `checkLayout`), the caps `MAX_PIE_SLICES` 6, `MAX_RADAR_AXES` 8, `MAX_LABEL_CHARS` 14, `MAX_CATEGORIES_BY_SPAN` {6: 8, 12: 16} |
| `packages/dashboard-engine/src/layout.ts` | engine | `packDashboard(cards)` — stats first (widths so a stat row sums to 12), charts paired 6 + 6 with an odd last one widened to 12, tables 12, then `placeWidgets` |
| `apps/api/src/modules/dashboard-generation/dashboard-generation.schema.ts` | schema | statuses + terminal rule + wire/db case, phases, source mirrors, the caps (`MIN_CARDS` 3, `MAX_CARDS` 8, `MAX_ATTEMPTS` 2, `WAIT_FOR_ROWS_SECONDS` 5, `MAX_WAIT_POLLS` 120), `GenerationStep`, `DashboardBrief`, `GenerationCard`, `VerifyIssue` (the engine's codes + `UNPARSABLE`), `DashboardReview`, `GenerationResult`, `DashboardGeneration`, `GenerationChange`, every input |
| `apps/api/src/modules/dashboard-generation/dashboard-generation.errors.ts` | errors | `DashboardGenerationNotFoundError`, `DashboardGenerationBusyError`, `DashboardGenerationFinishedError`, `DashboardGenerationDispatchError`, `DashboardGenerationUnavailableError` |
| `apps/api/src/modules/dashboard-generation/dashboard-generation.service.ts` | service | prisma: `create`, `find`, `byId`, `active`, `latest`, `listChangedSince`, `latestEventId`, `controlInfo`, `setTriggerRunId`, and the guarded transitions `markRunning` (closes the open log entry, appends the phase), `setBrief`, `complete`, `fail`, `cancel` |
| `apps/api/src/modules/dashboard-generation/dashboard-generation-control.service.ts` | service | prisma-free: `setDispatcher`, `start` (the key check, also the in-process entry point with `awaitBatchId`), `cancel` |
| `apps/api/src/modules/dashboard-generation/dashboard-generation-pipeline.service.ts` | service | prisma-free, SDK-free: `run({ workspaceId, spreadsheetId }, deps)` — the whole pipeline over injectable `analyze` / `propose` / `review` generators and `onPhase` / `assertAlive` / `setBrief` hooks; `parseBrief`, `toGenerationCard`, `parseReview`, `pickBest`, `describeLayout`, `pipelineGenerators` (the real calls) |
| `apps/api/src/modules/dashboard-generation/dashboard-generation-changes.service.ts` | service | the live stream: `changes` (the `onChange` generator), the per-process pump, the snapshot — scoped by workspace |
| `apps/api/src/modules/dashboard-generation/dashboard-generation.feed.ts` | feed | `dashboardGenerationFeed = new LiveFeed("dashboard_generation_changed", "dashboard-generation")` |
| `apps/api/src/modules/dashboard-generation/dashboard-generation.module.ts` | module | the feed's Nest lifecycle |
| `apps/api/src/modules/assistant/assistant-context.ts` | reads | `loadAssistantContext` (dashboard scope: the first 2,000 rows profiled, kept as `payload` for the verify stage, empty AI columns marked pending) — shared with the assistant |
| `apps/api/src/modules/assistant/assistant-tools.ts` | pure | `proposalCardSchema` (the strict shape of one proposed card), `defaultWidgetSpan` — shared with the assistant's tools |
| `apps/api/src/ai/dashboard-prompt.ts` | pure | all three start with the context's `company` block when there is one ([company.md](company.md)); `buildAnalyzePrompt`, `buildProposePrompt(context, brief, feedback)` (`<brief>`, and `<previous-attempt>` with every issue and the reviewer's reasons on the retry), `buildReviewPrompt(brief, cards, issues, layout, company?)` (`<cards>` with the first 3 computed rows each), `describeBrief`; over the assistant prompt's `describeData`, `WIDGET_GRAMMAR`, `CHART_SENSE_RULES` |
| `apps/api/src/ai/dashboard-brief.ts`, `dashboard-propose.ts`, `dashboard-review.ts` | model | `generateDashboardBrief`, `generateDashboardCards`, `generateDashboardReview` — one `generateText` + `Output.object` each over a deliberately lenient schema, no tools; `BriefGenerator` / `ProposalGenerator` / `ReviewGenerator` (the injectable types) |
| `apps/api/src/trigger/generate-dashboard.ts` | task | `generate-dashboard` (`{ generationId }`): the wait and the pipeline — see Behaviour |
| `apps/api/src/jobs/dashboard-generation-dispatch.ts` | job client | `registerDashboardGenerationDispatcher()` → `tasks.trigger("generate-dashboard", …, { idempotencyKey: generationId })`, `runs.cancel`; the only `@trigger.dev/sdk` importer for this feature; called from `src/main.ts` |
| `apps/api/src/trpc/routers/dashboard-generation.ts` | router | `start`, `byId`, `active`, `latest`, `cancel`, `onChange` (subscription) |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `dashboardGeneration.start` | mutation | `DashboardGenerationControlService.start` | `WORKSPACE_NOT_FOUND`, `SPREADSHEET_NOT_FOUND`, `DASHBOARD_GENERATION_UNAVAILABLE`, `DASHBOARD_GENERATION_BUSY`, `DASHBOARD_GENERATION_DISPATCH_FAILED`, validation |
| `dashboardGeneration.byId` | query | `DashboardGenerationService.byId` | `DASHBOARD_GENERATION_NOT_FOUND`, validation |
| `dashboardGeneration.active` | query | `DashboardGenerationService.active` | validation |
| `dashboardGeneration.latest` | query | `DashboardGenerationService.latest` | validation |
| `dashboardGeneration.cancel` | mutation | `DashboardGenerationControlService.cancel` | `DASHBOARD_GENERATION_NOT_FOUND`, `DASHBOARD_GENERATION_FINISHED`, validation |
| `dashboardGeneration.onChange` | subscription (SSE) | `DashboardGenerationChangesService.changes` | validation |

## Behaviour

- **The dispatcher is a hook with two verbs.** `src/modules/**` may not import
  `@trigger.dev/sdk`, so `setDispatcher` takes `{ trigger, cancel }`,
  registered by `src/jobs/dashboard-generation-dispatch.ts` from `src/main.ts`
  — never from `bootstrap.ts`, which the test suite boots. Without a
  dispatcher a generation stays `pending` and a cancel still flips the row.
- **`start` checks the key, inserts first, dispatches second.** The api
  refuses without an AI key (`isAiConfigured()`: `AI_API_KEY`; the worker's
  `aiModel()` would only throw a plain Error later); the `pending` row (and its trigger)
  reaches the page before the worker is asked; a dispatch that throws fails
  the row and surfaces as `DashboardGenerationDispatchError`; a cancel that
  lands between the insert and the handle is caught by a re-read.
- **The row is the truth; the worker follows it.** `cancel` writes
  `CANCELLED` through the guarded update and then calls `runs.cancel` best
  effort. Every worker transition is a guarded `updateMany` on non-terminal
  rows (`DashboardGenerationFinishedError` when nothing matched), and the task
  re-reads the row between phases and between polls of the batch, so a
  cancelled generation stops at its next step.
- **The task waits for the onboarding batch before it looks.** With an
  `awaitBatchId` the task marks `waiting_for_rows` and sleeps with
  `wait.for` (5 s, checkpointed — free of `maxDuration`) until every cell run
  of the batch is terminal or 120 polls (10 min) pass, then analyzes the
  sheet as it is. The batch itself is created by `onboarding.finish` in the
  api, not by the task: the sheet's live stream and the `rowLimit` contract
  depend on the rows existing before the response.
- **The pipeline is one service, the task its thinnest caller.**
  `DashboardGenerationPipelineService.run` loads the dashboard context (the
  first 2,000 rows profiled, the pending AI columns marked), asks for the
  brief (`analyze`; an unreadable brief fails the generation —
  `DashboardBriefUnusable`), then up to `MAX_ATTEMPTS` rounds: `propose` →
  strict parse per card (`proposalCardSchema`, defaults filled; an unparsable
  card is an `UNPARSABLE` issue) → `packDashboard` → `verifyDashboard` over
  the profiled rows → every card with an `error` issue dropped → re-packed →
  `review` with the engine's findings, the row layout and the first three
  computed rows per card → the reviewer's `drop` verdicts applied. A round
  passes when the reviewer passed it, nothing was dropped and at least
  `MIN_CARDS` remain; otherwise the next round's prompt carries
  `<previous-attempt>` (every card, its issues, the layout, the reviewer's
  reasons). The best round — a passing one, else the most cards, then the
  fewest warnings — is applied with `dashboardService.replace` (validate-then-
  swap; the engine already passed every card). No card left: `completed` with
  `result.reason "no_value"` and the dashboard untouched.
- **Phase writes are the progress.** `onPhase` → `markRunning` closes the open
  log entry (in `steps`) as `done` and appends the new one as `running`; `complete` and
  `fail` close it as `done` / `failed`. Every write fires the notify trigger,
  so the page's step list follows the worker with no other channel.
- **The generators are lenient, the schema strict.** Each model call is
  `generateText` + `Output.object` with no `pattern` or array caps (the
  provider drops them from a response schema) and no tools (the provider
  refuses tools and a JSON schema in one request). The strict twins (`dashboardBriefSchema`,
  `proposalCardSchema`, `dashboardReviewSchema`) run in the pipeline; an
  unreadable review counts as a fail with a reason the retry can read.
- **The stream is derived, not stored.** `changes` subscribes to the feed
  before reading, replays by `updatedAt` range, snapshots the active
  generation (or null), and ends itself with `closed` when a terminal event
  leaves `active` null. Event ids are database timestamps.

## Reusable pieces

- `DashboardGenerationControlService.start({ workspaceId, source, awaitBatchId })`
  — the in-process entry point (`onboarding.finish` uses it).
- `DashboardGenerationPipelineService.run(input, deps)` — the model-free
  path: any caller (a scripted setup, a test) drives the whole pipeline with
  its own generators and hooks.
- `verifyDashboard` / `verifyLayout` / `packDashboard` in the engine — pure,
  the browser can run them too (a "check this dashboard" affordance).
- `buildProposePrompt(context, brief, feedback)` — the "fix these mistakes"
  prompt shape for any future generate-then-critique loop.

## Used by

- `/` ([root.md](../routes/root.md)) — the "AI Recommendations" pill while
  the dashboard is empty: `latest` on load, `start { source: "dashboard" }`,
  `cancel`, `onChange` while a generation is active.
- `/onboarding` ([onboarding.md](../routes/onboarding.md)) — the finishing
  screen follows the generation `onboarding.finish` started (`onChange`).
- `onboarding.finish` ([onboarding.md](onboarding.md)) starts one with
  `source "onboarding"` and the batch id.
- The `generate-dashboard` Trigger.dev task is the writer of every transition
  after `pending` except `cancel`; it reads `runAi.listByBatch`
  ([run-ai.md](run-ai.md)) and writes through `dashboard.replace`
  ([dashboard.md](dashboard.md)).
