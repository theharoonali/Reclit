# 020 — Series and batch run: Run executes a rectangle of AI cells

**Status:** implemented
**Scope:** full feature

## Goal

Select a rectangle of cells (shift+click / shift+arrows) and press Run. Every
selected row is a series: its AI columns run in column `sortOrder`, each fed
the previous answer. Several rows are a batch, executed in **column waves** in
Trigger.dev: wave 1 prepares and runs the first AI column for every row (one
Trigger.dev batch, or a single run when it is one cell), wave 2 the next
column — its inputs rebuilt from the database, so the first column's answers
are in the row, and the previous answer named in the prompt — and so on. The
number of Trigger.dev batches equals the number of AI columns, not rows. A
cell that fails stops its row; other rows go on. Plan 017's "batches /
sequencing".

## Backend (Agent 1)

- **Table(s):** none changed. A `pending` run now has `result: null` until
  the worker prepares it; `result.input` gains `previous?` (the previous AI
  column of the row with the value it produced).
- **Procedures:** `runAi.runCell` → `runAi.runCells` (mutation,
  `{ id, rowIndexes: number[] (1..1000), columnIndexes: number[] (1..256) }`
  → `RunAi[]` pending, in series order; BAD_REQUEST
  `RUN_AI_COLUMN_NOT_RUNNABLE` (no selected column runnable) /
  `RUN_AI_BATCH_TOO_LARGE` (rows × runnable columns > 5000), NOT_FOUND sheet,
  CONFLICT `RUN_AI_CELL_BUSY` naming the busy cells, BAD_GATEWAY
  `RUN_AI_DISPATCH_FAILED`).
- **Service methods:** `run-ai-batch.service.ts` (new, prisma-free):
  `setDispatcher`, `runCells` (plan → busy pre-check → one `createMany` →
  waves → dispatcher; a throwing dispatcher `failPending`s the batch),
  `prepare(runId, previousRunId?)` (input from the database now + `previous`,
  stored with `setResult` while `pending`). `run-ai.service.ts` gains
  `createMany` (`createManyAndReturn`), `setResult` and `failPending`
  (guarded `updateMany`, never a terminal row); `runCell` and the dispatcher
  hook leave it.
- **Tasks:** `run-ai-batch` (new orchestrator: per wave → fail the cells of
  stopped rows → `prepare` the rest → `triggerAndWait` / `batchTriggerAndWait`
  `run-ai-cell` with per-item `idempotencyKey: runId` → a non-`completed`
  outcome stops the row; `onFailure` → `failPending` of every run).
  `run-ai-cell` unchanged but for an explicit `{ runId, status }` return.
  `src/jobs/run-ai-dispatch.ts` → one `tasks.trigger("run-ai-batch")` per
  click, `idempotencyKey: batchId`.
- **Prompt:** `buildCellMessages` names the previous step's output as the
  primary input (system) and adds an `Output of the previous step:` section.
- Reused: `columnsOf` (the ordering point), `columnOrThrow`, `rowCells`,
  `buildRowCells`, `parseCellId`, `describeError`, `mapDomainError`,
  `idInput`, `gridIndex` (now exported).

## Frontend (Agent 2)

- **Route(s):** `/ai-spreadsheet`, unchanged URL.
- **Components:** `lib/ai-spreadsheet/run-targets.ts` (new, pure:
  `selectionRect`, `planRunTargets`, the lockstep caps); `use-run-cell.ts` →
  `use-run-cells.ts` (`useRunCells`: `count`, `runnable`, `runAi.runCells`);
  `use-cell-editor.ts` (`onActiveColumnChange` → `onSelectionChange`, fired
  when the rectangle changes; `clearSelectedCells` reuses `selectionRect`);
  `use-sheet-canvas.ts` (threads it); `use-sheet-runs.ts` (`seed(runs[])`,
  one paint per batch); `ai-spreadsheet-run-button.tsx`,
  `ai-spreadsheet-grid.tsx` (wiring, labels, error copy).
- **States:** Run enabled iff the rectangle holds ≥ 1 AI cell with a prompt
  and none of them is working; label "Run" / "Run N cells"; too many rows →
  inline `listen.errorTooLarge` without a request; `CONFLICT` →
  `listen.errorBusy`. No painter change: every run of the batch is seeded
  `pending`.

## Integration (Agent 3)

- Run → `flushPending()` → `runListening.start()` → `runAi.runCells` →
  `seed(runs)`; a refusal → `runListening.cancel()`. No query invalidation:
  the stream carries every transition, `closed` arrives after the last wave.

## Decisions

- **Column waves in Trigger.dev, not one job per row** (user): fewer Trigger
  batches, and the wave boundary is where the next column's inputs are
  prepared. Trade-off: a slow row in wave *k* delays wave *k+1* for every row.
- **Input is built when the cell is prepared, for every step** — one rule;
  a single cell behaves as before because the sheet flushes edits first.
  `pending` runs therefore carry `result: null` (contract change).
- **One cell in a wave → `triggerAndWait`, more → `batchTriggerAndWait`**
  (user); one `settle` reads both.
- **`run-ai-cell` keeps its `{ runId, input }` payload**; only preparation
  moved from the API to the orchestrator.
- **`runCell` removed, not aliased** — the dashboard is the only consumer; a
  one-cell selection is a batch of one wave of one cell.
- **Busy = refuse the whole batch** (user); the pre-check names the cells,
  the partial unique index stays the guarantee.
- **No queue limit** (user); bounded by the Trigger environment.
- **Every cascade write is `failPending`** (non-terminal rows only), so a
  crash or a late `onFailure` cannot flip a completed step.
- **Orchestration in `run-ai-batch.service.ts`** — the base service was past
  the size cap; BACKEND.md names the `-changes` split as the precedent.

## Risks / open questions

- Trigger env concurrency: a 1,000-row wave queues beyond the limit; runs
  simply wait as `pending`.
- Wave results are matched to cells by position (documented order); a length
  mismatch is logged.
- `createManyAndReturn` order is not a promise; the service maps rows back by
  `cellId`. All runs of a click share `createdAt`, so `listByBatch` order
  inside a batch is not series order.
- Preparation is sequential per wave (one row read per cell); a 1,000-row
  wave takes seconds to prepare before it starts.

---

## Outcome

- **Shipped:** everything above. Backend: `modules/run-ai/run-ai.schema.ts`
  (`previous`, `RunAiBatchJob`, `runAiCellsInput`, the caps),
  `run-ai.errors.ts` (`cellIds`, `RunAiBatchTooLargeError`),
  `run-ai.service.ts` (`createMany`, `setResult`, `failPending`; `runCell`
  and the dispatcher hook gone), new `run-ai-batch.service.ts` (`runCells`,
  `prepare`, `setDispatcher`), `trpc/routers/run-ai.ts` (`runCells`),
  `jobs/run-ai-dispatch.ts` (one `tasks.trigger("run-ai-batch")`), new
  `trigger/run-ai-batch.ts`, `trigger/run-ai-cell.ts` (explicit outcome),
  `ai/cell-prompt.ts` (previous-step section),
  `spreadsheet.schema.ts` (`gridIndex` exported). `run-ai.api.test.ts`: 55
  tests. Frontend: new `lib/ai-spreadsheet/run-targets.ts` +
  `tests/ai-spreadsheet/run-targets.test.ts` (9 tests), `use-run-cell.ts` →
  `use-run-cells.ts`, `use-cell-editor.ts` (`onSelectionChange`,
  `selectionRect`), `use-sheet-canvas.ts`, `use-sheet-runs.ts`
  (`seed(runs[])`), `ai-spreadsheet-run-button.tsx`,
  `ai-spreadsheet-grid.tsx`, `messages/en.json`.
- **Deviated:** `prepare` stores the input with a new `setResult` (a guarded
  result-only write) rather than through `markRunning`, so a prepared run is
  still `pending` until its cell task starts — the capsule vocabulary is
  unchanged. `RunAiColumnNotRunnableError` and `RunAiCellBusyError` accept a
  list. The orchestrator failing a stopped row's cells uses one `failPending`
  per cell rather than per column (simpler; the count is small).
- **Verified live** (`bun dev` + `trigger:dev`, 2026-09-06): shift-selecting
  3 rows × Summary…Tone (with the plain Site column between) read "Run 6
  cells"; one click seeded six `pending` capsules; the Trigger dashboard/log
  showed one `run-ai-batch` run, three parallel `run-ai-cell` runs for
  Summary, then three for Tone; the Summary cells filled first, then Tone
  ("Advisory", "Informative", "Informative"); each Tone run's
  `result.input.previous` held its row's Summary output and its
  `input.row.cells` the persisted Summary. Making the Summary column
  non-runnable before the worker prepared a batch failed both Summary runs
  with `RunAiColumnNotRunnableError` and both Tone runs with
  `RunAiSeriesStopped: previous step "Summary" failed` without running
  them. A one-cell selection produced one `run-ai-batch` and exactly one
  `run-ai-cell` (the `triggerAndWait` path). `bunx turbo build` passed.
- **Not done:** the busy-selection and too-large paths were verified by unit
  tests only (`run-targets.test.ts`, the contract), not clicked through; the
  per-cell error state is still not painted (a stopped cell's capsule just
  goes); credit accounting and a stale-run sweep remain open from plan 017.
  Preparation inside a wave is sequential (one row read per cell).
- **Docs updated:** `docs/features/run-ai.md`, `docs/routes/ai-spreadsheet.md`,
  `ARCHITECTURE.md`, `docs/RELIABILITY.md`, `docs/rules/BACKEND.md` (split
  table), `apps/api/.env.example`, the contract header of
  `run-ai.api.test.ts`.
