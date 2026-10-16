# 030 — Assistant island: the AI command capsule in the header

**Status:** implemented
**Scope:** full feature

## Goal

A Dynamic-Island-style black capsule sits centred in the app header on `/`
and `/ai-spreadsheet`. Idle it shows a small animated orb; on hover or focus
it widens into a text field with a mic button (send once there is text; Enter
sends). The prompt runs as a background job whose stages stream live into the
capsule — Queued → Thinking → Working: *step* → Done / Failed / Cancelled —
with a cancel button throughout. On the sheet the assistant can create,
rename, retype, reorder columns, write cell values (by list or by rule) and
append rows; on the dashboard it can create and update widgets and set the
title. **Every delete (column, rows, widget) pauses the run and asks inside
the capsule**; unanswered for 10 minutes, the run cancels itself. The same
entry point is callable in-process, so onboarding can start a run later
without the UI.

Decided with the user: mic = record in the browser + transcribe through
ElevenLabs (new REST endpoint, every browser); model = Gemini 2.5 Flash via
`src/ai/gemini.ts` (`ASSISTANT_MODEL` env to switch); cell values may be
written, bounded; confirmations live inside the capsule.

## Backend (Agent 1)

- **Table `AssistantRun`** (+ enums `AssistantScope { DASHBOARD SPREADSHEET }`,
  `AssistantSource { USER SYSTEM }`): `id`, `workspaceId` (fk cascade),
  `spreadsheetId?` (fk cascade), `scope`, `source`, `prompt` (≤ 2000),
  `status` text uppercase (`PENDING THINKING WORKING AWAITING_CONFIRMATION
  COMPLETED FAILED CANCELLED`; last three terminal), `steps Json`
  (`AssistantStep[]`, ≤ 20, inputs summarised), `pendingAction Json?`,
  `summary?`, `error Json?`, `model?`, `usage Json?`, `transcript Json?`
  (the model messages, ≤ 64 KB, **never on the wire**), `triggerRunId?`,
  `createdAt`, `updatedAt` (its ms = SSE event id). Indexes
  `[workspaceId, updatedAt]`, `[createdAt]`. Migration SQL adds the partial
  unique `AssistantRun_active_workspace_key ON ("workspaceId") WHERE status
  NOT IN ('COMPLETED','FAILED','CANCELLED')` and the `assistant_run_notify`
  trigger → `pg_notify('assistant_run_changed', NEW.id)` (copied from the
  run-ai migration).
- **Procedures** (`assistant` router):

  | Procedure | Kind | Payload | Response | Errors |
  | --- | --- | --- | --- | --- |
  | `assistant.start` | mutation | `{ workspaceId; scope; prompt }` | `AssistantRun` | NOT_FOUND (`WORKSPACE_NOT_FOUND`, `SPREADSHEET_NOT_FOUND`), CONFLICT `ASSISTANT_BUSY`, BAD_GATEWAY `ASSISTANT_DISPATCH_FAILED`, BAD_REQUEST |
  | `assistant.byId` | query | `{ id }` | `AssistantRun` | NOT_FOUND |
  | `assistant.active` | query | `{ workspaceId }` | `AssistantRun \| null` | — |
  | `assistant.cancel` | mutation | `{ id }` | `AssistantRun` | NOT_FOUND, CONFLICT `ASSISTANT_FINISHED` |
  | `assistant.respond` | mutation | `{ id; approved }` | `AssistantRun` | NOT_FOUND, CONFLICT `ASSISTANT_NOT_AWAITING` |
  | `assistant.onChange` | subscription | `{ workspaceId; lastEventId? }` | tracked `AssistantChange` | BAD_REQUEST |
  | `POST /assistant/transcribe` | REST | multipart `file` (audio ≤ 10 MB) | `{ text; languageCode }` | 400, 502 `ASSISTANT_TRANSCRIPTION_FAILED`, 503 `ASSISTANT_TRANSCRIPTION_UNAVAILABLE` |

- **Services:** `assistant.service.ts` (prisma: reads + guarded transitions
  `markThinking / markWorking / finishStep / markAwaiting / recordResponse /
  complete / fail / cancel`, `setTriggerRunId`, `setTranscript`),
  `assistant-control.service.ts` (prisma-free: `setDispatcher({ trigger,
  cancel, completeToken } | null)`, `start`, `cancel`, `respond`),
  `assistant-transcribe.service.ts`, `assistant-changes.service.ts` (the
  stream, scoped by workspace), `assistant.feed.ts`, `assistant-context.ts`
  (reads for the prompt + `readAllRows`), `assistant-tools.ts` (pure tool
  table per scope, `DESTRUCTIVE_TOOLS`, `summariseStepInput`,
  `defaultWidgetSpan`), `assistant-executor.ts` (tool call → services, caps,
  `deps.confirm` / `deps.isCancelled`). `src/ai/assistant-prompt.ts` (pure
  system prompt with tagged untrusted data blocks), `src/ai/assistant-step.ts`
  (the one `generateText` with tools and no `execute`). Task
  `src/trigger/assistant-run.ts` (own loop, ≤ 12 steps, sequential tool
  calls, waitpoint token per destructive call with
  `idempotencyKey: runId:step`, timeout → cancel, `onFailure → fail`);
  `src/jobs/assistant-dispatch.ts` (`tasks.trigger` with `idempotencyKey:
  runId`, `runs.cancel`, `wait.completeToken`) registered from `main.ts`.
- **Reused:** `run-ai.feed.ts` is extracted into `src/common/live-feed.ts`
  (`LiveFeed(channel, label)`); `SpreadsheetNotFoundError`;
  `workspaceService.byId`; `spreadsheetService.columnsOf / rows`;
  `spreadsheetColumnsService.*`; `spreadsheetCellsService.updateRow /
  appendRow / removeRows`; `dashboardWidgetsService.*`;
  `dashboardService.update / byWorkspace`; `@reclit/dashboard-engine`
  `bindSheet` + `applyFilters` for the rule tools; `transcribeAudio`;
  `describeError`, `toJsonInput`, `isUniqueViolation`, `mapDomainError`.
- **Tools.** Spreadsheet: `readRows`, `getColumnSummary`, `createColumn`,
  `updateColumn`, `reorderColumn`, `setCells` (≤ 500), `fillColumn` (rule),
  `appendRows` (≤ 100), `removeColumn`\*, `removeRows`\* (≤ 1000, by indexes
  or rule). Dashboard: `readRows`, `getColumnSummary`, `createWidget`
  (placement optional → new bottom row, span by type), `updateWidget`,
  `updateDashboard`, `removeWidget`\*. \* = confirmation. Per run: 12 model
  steps, 20 tool calls, 2,000 cell writes.

## Frontend (Agent 2)

- **Routes:** `/` and `/ai-spreadsheet` unchanged; the island is mounted
  once in `app/(app)/layout.tsx` and picks its scope from
  `config/assistant.ts` (`scopeForPath`: `/` → `dashboard`,
  `/ai-spreadsheet` → `spreadsheet`, else hidden). Hidden below `md`.
- **Tokens (`packages/ui/src/tokens.ts`):** colours `island`,
  `island-foreground` (both palettes); sizes `island-closed` (3.25rem),
  `island` (24rem), `island-wide` (30rem), `orb` (1.75rem).
- **Primitives:** `Input` gains cva `variant: "field" | "bare"`; `Button`
  gains `variant: "island"`. Listed in FRONTEND.md's inventory.
- **Chrome:** `header-actions.tsx` gets a third slot `HeaderCenter`
  (outlet `pointer-events-none absolute inset-x-0 top-0 hidden h-header
  items-center justify-center md:flex`); `app-header.tsx` becomes
  `relative` and renders `<HeaderCenterOutlet />`. Absolute centring, not a
  flex child, so the capsule never drifts when the sheet toolbar grows.
- **Components (`components/assistant/`):** `assistant-provider.tsx`
  (context + `registerPage(scope, { beforeStart?, refresh })` registry +
  default dashboard refresh), `use-assistant-run.ts` (`active` +
  `onChange` subscription, fold, last-terminal memory), `use-assistant-actions.ts`
  (`start` / `cancel` / `respond`, error-code → key), `use-voice-input.ts`
  (`MediaRecorder`, 60 s, upload via `lib/assistant/transcribe.ts`),
  `assistant-island.tsx` (the capsule + modes), `assistant-orb.tsx` (canvas
  placeholder via `useCanvasSurface`, paused when hidden / reduced motion),
  `assistant-stage.tsx`, `assistant-confirm.tsx`, `assistant-result.tsx`;
  pure `lib/assistant/step-label.ts`, `lib/assistant/island-state.ts`;
  `components/ai-spreadsheet/use-assistant-refresh.ts` (registers
  `flushPending → onBeforeRefresh → invalidate rows`). Icons lucide.
- **States:** idle / open / typing / recording / transcribing / submitting /
  running (pending · thinking · working) / awaiting (buttons disabled after a
  response) / result (done auto-collapses 8 s, failed until dismissed,
  cancelled 4 s); error codes mapped to `assistant.errors.*`; `aria-live`
  stage; `motion-reduce:transition-none`. Namespace `assistant` in `en.json`.
  Tests in `apps/dashboard/tests/assistant/`.
- **Pinned wire shapes** (Agent 2 builds from fixtures typed to these):

  ```ts
  type AssistantStatus = "pending" | "thinking" | "working" | "awaiting_confirmation" | "completed" | "failed" | "cancelled";
  type AssistantRun = {
    id: string; workspaceId: string; spreadsheetId: string | null;
    scope: "dashboard" | "spreadsheet"; source: "user" | "system"; prompt: string;
    status: AssistantStatus; steps: AssistantStep[]; pendingAction: PendingAction | null;
    summary: string | null; error: { name: string; message: string } | null;
    model: string | null; usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
    createdAt: Date; updatedAt: Date;
  };
  type AssistantStep = { index: number; tool: string; input: Record<string, unknown>;
    status: "running" | "done" | "failed" | "declined"; mutated: boolean;
    summary: string | null; error: string | null; startedAt: string; finishedAt: string | null };
  type PendingAction = { stepIndex: number; tool: "removeColumn" | "removeRows" | "removeWidget";
    input: Record<string, unknown>; tokenId: string; requestedAt: string;
    response: { approved: boolean; at: string } | null };
  type AssistantChange = { type: "snapshot"; run: AssistantRun | null } | { type: "run"; run: AssistantRun } | { type: "closed" };
  ```

  Summarised step inputs: `createColumn { name, type }`, `updateColumn
  { column, name?, type? }`, `reorderColumn { column, position }`, `setCells
  { column, count }`, `fillColumn { column, value, where? }`, `appendRows
  { count }`, `removeColumn { column, count }`, `removeRows { count }`,
  `createWidget / updateWidget / removeWidget { name, type }`,
  `updateDashboard { title? }`, `readRows { startRow, limit }`,
  `getColumnSummary { column }`.

## Integration (Agent 3)

- `(app)/layout.tsx` mounts `<AssistantProvider>` + `<AssistantIsland />`;
  the hooks swap fixtures for `assistant.active` (`staleTime: 0`),
  `assistant.onChange` (`useSubscription`, enabled while a run is active or
  just started), `assistant.start / cancel / respond`.
- Refresh: on each `done` step with `mutated` (debounced 500 ms) and on every
  terminal status — dashboard: invalidate `dashboard.byWorkspace` +
  `SHEET_ROWS_QUERY_PREFIX`; sheet: the grid's registered handler. `start`
  awaits the scope's `beforeStart` (sheet: `flushPending`).
- Mic: `POST /assistant/transcribe` through `postFile`; text lands in the
  field, never auto-sent.

## Decisions

- Own loop (one `generateText` per step, tools without `execute`, sequential
  execution) over the SDK's `stopWhen` + `needsApproval` loop: the SDK runs
  a step's tool calls concurrently (two `createColumn`s race), and we need
  one DB write per step, a cancel check between calls and one waitpoint per
  destructive call.
- Confirmation = Trigger.dev waitpoint token (conversation stays in memory,
  the wait is free, `completeToken` works from the API). `transcript` is
  audit / insurance only; no resume-from-transcript in v1.
- The database row is the truth for cancel; `runs.cancel` is best effort
  (`onCancel` never fires for a queued or suspended run).
- The server emits identifiers (tool + summarised input); the client formats
  from `en.json` with ICU values. The model's `summary` is data.
- Scoped tool sets chosen by route, not one super-set.
- Rule tools (`fillColumn`, `removeRows where`) evaluate server-side with the
  engine's filters over the whole sheet (≤ 20,000 rows) instead of making the
  model page through `readRows`.
- The feed is extracted to `src/common/live-feed.ts`; changes services stay
  per feature.
- No credits, no run history UI, no multi-turn chat in v1.

## Risks / open questions

- Gemini function declarations from zod unions may be rejected — tool inputs
  stay flat; smoke-test one tool call first.
- The WidgetQuery grammar summary in the prompt can drift from the dashboard
  contract header.
- `fillColumn` reads the whole sheet per call; `appendRows ≤ 100` is 100
  transactions.
- A sheet refresh re-normalises the grid model under the user (editor is
  cancelled first); a pending write to a deleted column snaps back on 404.
- `completeToken` on a timed-out token is undocumented; both a throw and
  `success: false` map to `ASSISTANT_NOT_AWAITING`.
- Prompt injection through cell values: tagged untrusted blocks, user prompt
  never in `system`, zod-validated tool inputs, names re-resolved at
  execution, deletes need a human.

---

## Outcome

- **Shipped (backend):** `AssistantRun` + enums and the migration
  `20261016120000_add_assistant_run` (partial unique index, notify trigger);
  `src/common/live-feed.ts` extracted from the run-ai feed;
  `modules/assistant/` — schema, errors, `assistant.service.ts` (reads +
  guarded transitions), `assistant-control.service.ts` (`setDispatcher`,
  `start`, `cancel`, `respond`), `assistant-transcribe.service.ts`,
  `assistant-changes.service.ts`, `assistant.feed.ts`, `assistant.controller.ts`
  (`POST /assistant/transcribe`), `assistant.module.ts`, `assistant-context.ts`,
  `assistant-tools.ts`, `assistant-sheet.ts`, `assistant-tool-runtime.ts`,
  `assistant-sheet-tools.ts`, `assistant-dashboard-tools.ts`,
  `assistant-executor.ts`; `src/ai/assistant-prompt.ts`, `src/ai/assistant-step.ts`;
  `src/trigger/assistant-run.ts`; `src/jobs/assistant-dispatch.ts` registered
  from `main.ts`; the `assistant` router; `spreadsheetCellsService.updateCells`
  and `spreadsheetService.countRows`; `workspaceIdInput` moved to
  `src/common/schema.ts`. Contract: `assistant.api.test.ts` (52 tests, green);
  `run-ai.api.test.ts` still green over the shared feed.
- **Shipped (frontend):** size tokens `island-closed`, `island`,
  `island-wide`, `orb` (the capsule is transparent — decided with the user
  after the first look — so the planned `island` / `island-foreground`
  colours were dropped); `Input` variant `bare`, `Button` variant `island`
  (a round ghost, circular hover); the header's `HeaderCenter` slot (absolute,
  centred); `components/assistant/` (provider, island, composer, orb, stage,
  confirm, result, `use-assistant-run.ts`, `use-run-lifecycle.ts`,
  `use-voice-input.ts`), `lib/assistant/` (`types.ts` from `RouterOutputs`,
  `island-state.ts`, `step-label.ts`, `transcribe.ts`), `config/assistant.ts`,
  `components/ai-spreadsheet/use-assistant-refresh.ts` wired in the grid,
  the `assistant` namespace in `en.json`, three pure test files.
- **Deviated:** the executor is split into `-sheet-tools` / `-dashboard-tools`
  / `-tool-runtime` / `-sheet` (size caps); `readRows` replaces the planned
  `findRows` (the rows API has no predicate) and `fillColumn` / `removeRows
  where` evaluate rules server-side with the engine's filters; the capsule
  keeps the finished run itself until dismissed, so `lastTerminal` is always
  null; the model's step limit ends the run `failed` with
  `error.name "AssistantStepLimit"` rather than `completed`; a step's
  `summary` is reserved (always null). After the first look the user asked
  for a transparent capsule (no fill tokens), a pill field with the standard
  border and focus colour, round island buttons, a smoother orb (filled arcs,
  no clip path), and the sheet's Run moved out of the toolbar into the
  capsule's right-hand pill "Run AI" (`PageAction` on the provider,
  `use-assistant-run-action.ts`), shown only while the selection holds
  runnable AI cells. The onboarding hook is not wired —
  `assistantControlService.start({ …, source: "system" })` is the entry
  point when it is.
- **Verified:** api + dashboard lint, typecheck and tests; the production
  dashboard build; in the browser — idle / open / typing / send, `start` →
  "Queued" through the SSE stream, cancel → "Cancelled" → auto-collapse, the
  island on both pages; one real Gemini 2.5 Flash step per scope accepted the
  tool declarations and answered with `createWidget` (a valid stat query) and
  `fillColumn` (an `isEmpty` rule).
- **Not verified here:** a full worker run in the browser (the Trigger.dev CLI
  on this machine is logged into a profile that does not own the project, so
  no local worker could attach; the queued run was cancelled from the
  capsule), the mic against ElevenLabs, the confirmation round trip through a
  real waitpoint token, and the 10-minute timeout. Each is covered at the
  service / contract level only.
- **Not done:** credits accounting, a run history UI, multi-turn chat, a
  `trigger dev` smoke of `wait.forToken` memory survival.
- **Docs updated:** `docs/features/assistant.md` (+ index row),
  `run-ai.md` (feed), `spreadsheet.md` (`updateCells`, `countRows`),
  `docs/routes/root.md`, `docs/routes/ai-spreadsheet.md`,
  `docs/rules/FRONTEND.md` (slot + variants), `ARCHITECTURE.md`,
  `apps/api/.env.example`, `turbo.json` (`ASSISTANT_MODEL`).
