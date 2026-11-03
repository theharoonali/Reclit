# `assistant`

**Purpose:** one record per prompt the user sends from the header capsule —
what was asked, every tool call the model made, where the run stands — plus
the live stream the capsule paints from, the Trigger.dev task that runs the
model's tool loop through the spreadsheet and dashboard services, and the
mic's transcription route. The AI-built dashboard is its own feature
([dashboard-generation.md](dashboard-generation.md)) that reuses this one's
context loader, prompt blocks and card schema.

**Contract:** `apps/api/src/__tests__/assistant.api.test.ts` — payloads,
responses, stream events, step shapes, error codes and every client-visible
behaviour live in its header. Do not duplicate them here.

## Table `AiRun` (kind `ASSISTANT`)

Assistant runs are the `ASSISTANT` kind of the shared `AiRun` table
([run-ai.md](run-ai.md) has the table's `CELL` side,
[dashboard-generation.md](dashboard-generation.md) its `DASHBOARD` side).
Every `AssistantService` query spreads `KIND` (`{ kind: "ASSISTANT" }`). The
columns an assistant run uses (the rest stay null):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `kind` | `AiRunKind` | `ASSISTANT` |
| `workspaceId` | `String?` | required for `ASSISTANT` (the `CHECK`); fk cascade → `Workspace`; indexed with `kind`, `updatedAt` |
| `spreadsheetId` | `String?` | the workspace's sheet, resolved by `start`; no fk — the `ai_run_spreadsheet_cascade` trigger deletes the run with its sheet |
| `scope` | `AssistantScope?` | required for `ASSISTANT`; `DASHBOARD SPREADSHEET`; decides the tool set; lowercase on the wire |
| `source` | `AiRunSource?` | required for `ASSISTANT`; `USER` or `SYSTEM` (the enum's `ONBOARDING` / `DASHBOARD` belong to dashboard generations); lowercase on the wire |
| `prompt` | `String?` | required for `ASSISTANT`; ≤ 2,000 |
| `status` | `String` | uppercase word; `PENDING THINKING WORKING AWAITING_CONFIRMATION COMPLETED FAILED CANCELLED`; the last three are terminal |
| `steps` | `Json?` | required for `ASSISTANT`; `AssistantStep[]`, written `[]` on create; inputs summarised (`summariseStepInput`), never raw cell lists |
| `pendingAction` | `Json?` | the delete waiting for the user while `AWAITING_CONFIRMATION`: tool, summarised input, waitpoint `tokenId`, the user's `response` once given |
| `summary` | `String?` | the model's closing message, ≤ 2,000, plain text |
| `error` | `Json?` | `{ name, message }` via `describeError` |
| `model` / `usage` | `String?` / `Json?` | the model id and the summed token usage (`cachedInputTokens`: what the provider's prompt cache served; absent on older runs) |
| `transcript` | `Json?` | the `ModelMessage[]` the loop built, ≤ 64 KB (`trimTranscript`) — audit only, **never selected** |
| `triggerRunId` | `String?` | the Trigger.dev run id, stored after `tasks.trigger`; what `cancel` hands to `runs.cancel`; never selected |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt`; its ms value is the SSE event id |

Indexes: `[kind, workspaceId, updatedAt]`, `[createdAt]` · Relations:
`Workspace.aiRuns[]` (cascade) · Migration:
`apps/api/prisma/migrations/20261103180000_consolidate_tables/`, which also
holds what the Prisma schema cannot express:

| Object | What it does |
| --- | --- |
| `CHECK` `AiRun_kind_columns_check` | an `ASSISTANT` row has `workspaceId`, `scope`, `source`, `prompt` and `steps` |
| partial unique index `AiRun_active_assistant_key` on `workspaceId WHERE kind = 'ASSISTANT' AND status NOT IN ('COMPLETED','FAILED','CANCELLED')` | one active run per workspace, enforced by the database (`ASSISTANT_BUSY`) |
| function + trigger `ai_run_notify` (`AFTER INSERT OR UPDATE`) | `pg_notify('assistant_run_changed', NEW.id)` for an `ASSISTANT` row (`CASE kind`) — every writer, in any process, publishes |
| function + trigger `ai_run_spreadsheet_cascade` (`AFTER DELETE` on `Spreadsheet`) | deletes the sheet's assistant runs with it |

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `AiRun`, `AiRunKind`, `AiRunSource`, `AssistantScope` |
| `apps/api/src/common/live-feed.ts` | common | `LiveFeed(channel, label)` — one `pg` LISTEN per process with a 10 s ping, reconnect + `resync`; shared with run-ai |
| `apps/api/src/common/schema.ts` | common | `workspaceIdInput`, shared with the dashboard |
| `apps/api/src/modules/assistant/assistant.schema.ts` | schema | statuses + terminal rule + wire/db case, scope/source mirrors, the caps, the tool-name lists per scope and `ASSISTANT_DESTRUCTIVE_TOOLS`, `AssistantStep`, `AssistantPendingAction`, `AssistantRun`, `AssistantChange`, every input |
| `apps/api/src/modules/assistant/assistant.errors.ts` | errors | `AssistantNotFoundError`, `AssistantBusyError`, `AssistantNotAwaitingError`, `AssistantFinishedError`, `AssistantDispatchError`, the three transcription errors |
| `apps/api/src/modules/assistant/assistant.service.ts` | service | prisma: `create`, `find`, `byId`, `active`, `listChangedSince`, `latestEventId`, `controlInfo`, `setTriggerRunId`, `setTranscript`, and the guarded transitions `markThinking`, `markWorking`, `finishStep`, `markAwaiting`, `recordResponse`, `complete`, `fail`, `cancel` |
| `apps/api/src/modules/assistant/assistant-control.service.ts` | service | prisma-free: `setDispatcher`, `start` (also the in-process entry point, with `source`), `cancel`, `respond` |
| `apps/api/src/modules/assistant/assistant-transcribe.service.ts` | service | the mic: an audio upload → `transcribeAudio` → `{ text, languageCode }` |
| `apps/api/src/modules/assistant/assistant-changes.service.ts` | service | the live stream: `changes` (the `onChange` generator), the per-process pump, the snapshot — scoped by workspace |
| `apps/api/src/modules/assistant/assistant.feed.ts` | feed | `assistantFeed = new LiveFeed("assistant_run_changed", "assistant")` |
| `apps/api/src/modules/assistant/assistant.controller.ts` | controller | `POST /assistant/transcribe` (multipart `file`) |
| `apps/api/src/modules/assistant/assistant.module.ts` | module | the feed's Nest lifecycle + the controller |
| `apps/api/src/modules/assistant/assistant-context.ts` | reads | `loadAssistantContext({ workspaceId, scope, sheetId })` (workspace name, the sheet's description and purpose, row count, columns with their prompts, 10 sample rows; dashboard scope: the first 2,000 rows profiled with the engine's `profileColumns` and kept as `payload`, empty AI columns marked pending by `withPendingAiColumns`, and the dashboard; plus the workspace owner's compiled company profile, `companyContextService.forSpreadsheet` — [company.md](company.md)), `toPromptContext(scope, context)` (carries it as `company`), `readAllRows(sheetId, maxRows?)` (every stored row, ≤ 20,000, for the rule tools) |
| `apps/api/src/modules/assistant/assistant-tools.ts` | pure | the tool table (`ASSISTANT_TOOLS`: description + flat zod `inputSchema` per tool), `toolsForScope`, the per-call caps, `summariseStepInput`, `defaultWidgetSpan`, `toolWidgetQuerySchema` (the engine's query with `groupBy` optional and `in` as `values`), `proposalCardSchema` (the strict shape of one proposed card, shared with the dashboard generation) |
| `apps/api/src/modules/assistant/assistant-sheet.ts` | pure | `resolveColumn` (trimmed, case-insensitive), `toWidgetFilter`, `selectRowIndexes` (engine `bindSheet` + `applyFilters`), `summariseColumn` (the engine's `profileColumns` of one column, in the tool's shape: fill, distinct count, role, top values, ranges), `coerceToolValue` |
| `apps/api/src/modules/assistant/assistant-tool-runtime.ts` | pure | `ToolContext`, `ToolResult`, `ToolInputError` (a model mistake, reported back, never a failed run), `ToolBudget` (2,000 cell writes per run) |
| `apps/api/src/modules/assistant/assistant-sheet-tools.ts` | handlers | the spreadsheet tools over `spreadsheetService` / `spreadsheetColumnsService` / `spreadsheetCellsService` (`updateCells` for the bulk writes); `prepareRemoveColumn` / `prepareRemoveRows` (count first, write after the confirmation) |
| `apps/api/src/modules/assistant/assistant-dashboard-tools.ts` | handlers | the dashboard tools over `dashboardWidgetsService` / `dashboardService`; a card the model leaves unplaced gets a width for its type here and its slot from the service (the engine's `placeWidget`: the first row with room, else a new one); `toWidgetQueryInput`, `prepareRemoveWidget` |
| `apps/api/src/modules/assistant/assistant-executor.ts` | executor | `AssistantExecutor.execute(stepIndex, call)`: scope check, zod validation, the confirmation for a destructive tool (`deps.confirm`), `ToolInputError` / `DomainError` → a failed step the model reads; `AssistantConfirmationTimeoutError`; `toolSpecsForScope` |
| `apps/api/src/ai/assistant-prompt.ts` | pure | `buildAssistantSystemPrompt`: the `<company-context>` block first (`withCompanyContext`, when the context has one), then the rules, the tagged untrusted data blocks (`<sheet-description>`, `<columns>`, `<column-profile>`, `<sample-rows>`, `<widgets>`), `WIDGET_GRAMMAR` + `CHART_SENSE_RULES` for the dashboard scope, `PENDING_AI_COLUMN_RULE` when a profiled AI column has no values yet; `describeData` (the blocks, shared with the generation prompts); `withPendingAiColumns` / `roleForType` (an empty AI column's role from its type: number → measure, date → time, boolean → flag, string/email/url → category); `describeColumns`, `describeRows`, `describeSheet`, `truncateValue` (shared with the onboarding prompts) |
| `apps/api/src/ai/assistant-step.ts` | model | `runAssistantStep` — one `generateText` with the scope's tools (no `execute`, no `output`) → text or tool calls; `toToolSet`, `toolResultsMessage`, `toUsage` / `addUsage`, `trimTranscript`, `assistantModelId` (`ASSISTANT_MODEL`, default `defaultModelId()` — `AI_MODEL`, else the provider default in `ai/model.ts`) |
| `apps/api/src/trigger/assistant-run.ts` | task | `assistant-run` (`{ runId }`): the loop — see Behaviour |
| `apps/api/src/jobs/assistant-dispatch.ts` | job client | `registerAssistantDispatcher()` → `tasks.trigger("assistant-run", …, { idempotencyKey: runId })`, `runs.cancel`, `wait.completeToken`; the only `@trigger.dev/sdk` importer for this feature; called from `src/main.ts` |
| `apps/api/src/trpc/routers/assistant.ts` | router | `start`, `byId`, `active`, `cancel`, `respond`, `onChange` (subscription) |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `assistant.start` | mutation | `AssistantControlService.start` | `WORKSPACE_NOT_FOUND`, `SPREADSHEET_NOT_FOUND`, `ASSISTANT_BUSY`, `ASSISTANT_DISPATCH_FAILED`, validation |
| `assistant.byId` | query | `AssistantService.byId` | `ASSISTANT_NOT_FOUND`, validation |
| `assistant.active` | query | `AssistantService.active` | validation |
| `assistant.cancel` | mutation | `AssistantControlService.cancel` | `ASSISTANT_NOT_FOUND`, `ASSISTANT_FINISHED`, validation |
| `assistant.respond` | mutation | `AssistantControlService.respond` | `ASSISTANT_NOT_FOUND`, `ASSISTANT_NOT_AWAITING`, validation |
| `assistant.onChange` | subscription (SSE) | `AssistantChangesService.changes` | validation |
| `POST /assistant/transcribe` | REST | `AssistantTranscribeService.transcribe` | 400, `ASSISTANT_TRANSCRIPTION_INVALID`, `ASSISTANT_TRANSCRIPTION_UNAVAILABLE`, `ASSISTANT_TRANSCRIPTION_FAILED` |

## Behaviour

- **The dispatcher is a hook with three verbs.** `src/modules/**` may not
  import `@trigger.dev/sdk`, so `AssistantControlService.setDispatcher`
  takes `{ trigger, cancel, completeToken }`, registered by
  `src/jobs/assistant-dispatch.ts` from `src/main.ts` — not from
  `bootstrap.ts`, which the test suite boots. Without a dispatcher a run
  stays `pending`, a cancel still flips the row, and a response is recorded
  but wakes nobody.
- **`start` inserts first, dispatches second.** The `pending` row (and its
  trigger) reaches the capsule before the worker is asked. The handle's id is
  stored as `triggerRunId`; a dispatch that throws fails the row and surfaces
  as `AssistantDispatchError`. A cancel that lands between the insert and the
  handle finds nothing to stop, so `start` re-reads the row afterwards and
  stops the worker itself if it went terminal.
- **The row is the truth; the worker follows it.** `cancel` writes
  `CANCELLED` through the guarded update and then calls `runs.cancel` best
  effort (Trigger.dev's `onCancel` never fires for a queued or suspended run).
  Every worker transition is a guarded `updateMany` on non-terminal rows
  (`AssistantFinishedError` when nothing matched), and the task re-reads the
  row before every model call and every tool call, so a cancelled run stops
  at its next step even if the Trigger.dev cancel never arrives.
- **One loop, one tool call at a time.** The task moves the run `thinking`,
  calls `runAssistantStep` (the scope's tools declared without `execute`, so
  the SDK hands the calls back instead of running them — the SDK's own loop
  would run a step's calls concurrently, and two `createColumn`s race the
  `max(sortOrder)` read), then for each call appends a `running` step,
  executes it through `AssistantExecutor`, closes the step with the
  executor's enriched input, and answers the model with one `tool` message.
  A text answer completes the run; 12 model steps without one fails it
  (`AssistantStepLimit`); the 21st tool call is refused in the tool result.
  The transcript is stored after every step (trimmed to 64 KB) for audit;
  the loop keeps the full messages in memory.
- **A model mistake is a failed step, not a failed run.** The executor turns
  an unknown or out-of-scope tool, a zod refusal, a `ToolInputError` (unknown
  column, budget) and any `DomainError` from a service (a taken column name,
  a widget the engine rejects) into `{ error: { code, message } }` for the
  model and `error: "<CODE>: <message>"` on the step. Only an unexpected
  error escapes, fails the run and rethrows (`onFailure` covers the crash
  paths the catch cannot see).
- **Deletes pause on a waitpoint.** `removeColumn`, `removeRows` and
  `removeWidget` are prepared first (the count or the card's name the
  confirmation shows), then the task creates a Trigger.dev token
  (`timeout: "10m"`, `idempotencyKey: <runId>:<stepIndex>`), writes
  `AWAITING_CONFIRMATION` with the `pendingAction`, and suspends on it — free
  of `maxDuration`. `respond` records the answer on the action (one answer
  only) and completes the token; the task resumes, flips the row back to
  `WORKING`, executes or declines, and `finishStep` clears the action. A
  timeout cancels the run with `error.name
  "AssistantConfirmationTimeoutError"`.
- **Column names resolve at execution time** (`resolveColumn` against
  `columnsOf`), so a column renamed by an earlier step is found under its
  new name, and a name the model invented is a failed step. Values are coerced
  to the column type where that is unambiguous (`coerceToolValue`); anything
  else is the cells service's `SPREADSHEET_CELL_TYPE_MISMATCH`, reported back.
- **Rule tools evaluate server-side.** `fillColumn` and `removeRows where`
  read every stored row (`readAllRows`, ≤ 20,000) and pick rows with the
  engine's `applyFilters`, then write through `updateCells` / `removeRows`;
  the per-run budget (`ToolBudget`, 2,000 cells) is taken before the write.
- **The stream is derived, not stored.** `AssistantChangesService.changes`
  subscribes to the feed *before* reading, replays by `updatedAt` range,
  snapshots the active run (or null), and ends itself with `closed` when a
  terminal event leaves `active` null. Event ids are database timestamps.
  The feed starts with the Nest app (`AssistantModule`) and lazily on first
  use; the worker imports the service but never opens the feed.
- **The system prompt carries data as data.** The user's prompt is the
  `user` message, never part of `system`; columns, sample rows (10, values cut
  to 80 characters) and the current cards are wrapped in tags and declared
  untrusted; every tool input is validated and column names re-resolved, and
  deletes need a human — the posture against instructions hidden in cells.
- **The dashboard scope knows a quantity from a label.** Its context reads
  the first 2,000 rows and profiles every column with the engine
  (`profileColumns`: fill, distinct count, ranges, top values and a
  heuristic role — `identifier`, `year`, `time`, `flag`, `category`,
  `measure`, `text`, `other`); the prompt shows it as `<column-profile>` and
  `CHART_SENSE_RULES` say what each role may be (a measure is summed, a year
  or a date is an axis, an identifier is neither). An AI column with a
  prompt and no values yet is shown as `PENDING AI COLUMN` with a role from
  its type (`withPendingAiColumns`) and `PENDING_AI_COLUMN_RULE` lets the
  model chart it as if populated (the generation's brief reads the same
  blocks — [dashboard-generation.md](dashboard-generation.md)). The sheet's
  description and purpose, when set, open the data as `<sheet-description>`.
  The spreadsheet scope reads only its 10 sample rows.
- **Transcription stores nothing.** The route accepts `audio/*` (or the
  `video/webm` / `video/mp4` container an audio-only `MediaRecorder` may
  label a clip with), ≤ 10 MB, needs `ELEVENLABS_API_KEY` on the **api**
  process (503 without it), and answers the transcript for the user to
  review.

## Reusable pieces

- `AssistantControlService.start({ workspaceId, scope, prompt, source: "system" })`
  — the in-process entry point for onboarding or any job that wants a run
  without the capsule. From inside a Trigger.dev task, create the row with
  `assistantService.create` and `tasks.trigger("assistant-run", { runId })`
  directly (the hook is only registered in the api process).
- `LiveFeed` (`src/common/live-feed.ts`) + the changes-service shape — the
  pattern for the next live table: a trigger that notifies ids, one listener
  per channel, a per-scope async generator wrapped in `tracked()`.
- `AssistantExecutor` with a different `confirm` — any caller that wants the
  tools without the model (a scripted setup) can execute calls directly.
- `ASSISTANT_TOOLS` / `toolsForScope` — the one place a tool is added:
  register the name in `assistant.schema.ts`, its schema and description here,
  its handler in the matching `-tools.ts`, and (if it deletes) in
  `ASSISTANT_DESTRUCTIVE_TOOLS`.
- `readAllRows`, `summariseColumn`, `selectRowIndexes` — whole-sheet reads
  and rules for any server-side consumer.
- `spreadsheetCellsService.updateCells` and `spreadsheetService.countRows`
  ([spreadsheet.md](spreadsheet.md)) were added for this feature and are
  general.

## Used by

- `/` and `/ai-spreadsheet` ([root.md](../routes/root.md),
  [ai-spreadsheet.md](../routes/ai-spreadsheet.md)) — the header capsule:
  `active` on load, `start`, `cancel`, `respond`, `onChange` while a run is
  active, `POST /assistant/transcribe` for the mic. The capsule's "AI
  Recommendations" pill on `/` starts a dashboard generation
  ([dashboard-generation.md](dashboard-generation.md)), not an assistant run.
- The `assistant-run` Trigger.dev task is the writer of every transition
  after `pending` except `cancel` and `respond`.
