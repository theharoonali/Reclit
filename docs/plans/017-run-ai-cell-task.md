# 017 — The `run-ai-cell` task: Run executes one AI cell

**Status:** implemented
**Scope:** full feature

## Goal

Select a cell in an AI column and press Run: a `pending` run appears in the
cell at once, a Trigger.dev job receives the whole row (every column, in the
sheet's sort order, blank cells as `null`) together with the column's prompt,
moves the run to `running`, asks Gemini for a value typed like the column,
and completes the run — the value lands in the cell — or fails it with the
reason. `result.input` and `result.output` are kept on the run. One cell per
click; batches and sequencing are the next plan. The two stand-ins from
plans 015/016 go: the `gemini-test` smoke task and `POST /run-ai/test`.

## Backend (Agent 1)

- **Table(s):** none changed. `result` carries `input` (`RunAiInput`),
  `output`, `model`, `usage`, `error`.
- **Procedures:** `runAi.runCell` (mutation, `{ id, rowIndex, columnIndex }`
  → RunAi `pending` with `result.input`; BAD_REQUEST `RUN_AI_COLUMN_NOT_RUNNABLE`,
  NOT_FOUND sheet/column, CONFLICT `RUN_AI_CELL_BUSY`, BAD_GATEWAY
  `RUN_AI_DISPATCH_FAILED`). `POST /run-ai/test` removed.
- **Service methods:** `runCell` (column check → `rowCells` → `create` with
  `{ input }` → dispatcher), `setDispatcher`, `markRunning` guarded against
  terminal rows (`RunAiFinishedError`); `SpreadsheetService.rowCells` +
  `buildRowCells` (spreadsheet.shape.ts) build the sorted row in two indexed
  reads. `upsertForTest` removed.
- **Dispatch:** `src/jobs/run-ai-dispatch.ts` is the only importer of
  `@trigger.dev/sdk` on the API side (`tasks.trigger`, idempotency key = run
  id), registered from `src/main.ts` — never from `bootstrap.ts`, which the
  tests boot. Without a dispatcher a run stays `pending`.
- **Task:** `src/trigger/run-ai-cell.ts` (`schemaTask`, payload
  `{ runId, input }`, no retries, `onFailure` fails the run). Model call in
  `src/ai/cell-output.ts` (`generateText` + `Output.object` per type,
  `Output.json` for `json`, validated with `cellValueMatchesType`); prompt
  and answer shape in `src/ai/cell-prompt.ts` (pure); the row's audio /
  file / url cells fetched and attached as file parts by
  `src/ai/cell-attachments.ts`.
  `trigger.config.ts` adds `prismaExtension({ mode: "modern" })`.
- Reused: `columnOrThrow`, `columnsOf`, `cellRefInput`, `cellValueSchema`,
  `cellValueMatchesType`, `isPlainObject`, `parseCellId`/`cellId`,
  `mapDomainError`, `describeError` (new, `common/errors.ts`).

## Frontend (Agent 2)

- **Route(s):** `/ai-spreadsheet`, unchanged URL.
- **Components:** `use-run-cell.ts` (new: runnable rule, the mutation, error
  code), `ai-spreadsheet-run-button.tsx` (always "Run"; live glyph while
  streaming; inline error), `use-cell-editor.ts` (`onActiveColumnChange`),
  `use-sheet-runs.ts` (`onRunsChange`, `seed`), `use-sheet-canvas.ts`
  (threads both, exposes `runs`), `use-run-listening.ts` (`cancel`),
  `use-sheet-sync.ts` (`flushPending`), `ai-spreadsheet-grid.tsx` (wiring).
- **States:** Run enabled iff the selected cell's column is an AI node with a
  prompt and the cell has no working run; "Starting..." while the call is
  out; `listen.errorBusy` / `listen.error` inline. Keys under
  `aiSpreadsheet.listen.*` (`live` removed).

## Integration (Agent 3)

- Run → `flushPending()` (the row must be persisted; the API reads the
  database) → `runListening.start()` → `runAi.runCell` → `seed(run)` paints
  the pending capsule before the stream reports it. A refusal calls
  `runListening.cancel()` so a sheet with no run does not stay live. No
  query invalidation: the stream and the seed keep the model current.

## Decisions

- **Dependency inversion for the dispatcher**, not a REST hop and not a
  dynamic import: `src/modules/**` may not import the SDK (the dashboard
  transpiles it), and a hook registered from `main.ts` keeps the tRPC caller
  in tests network-free. `src/jobs/` rather than `src/trigger/` so the CLI
  does not bundle the client into the worker.
- **Payload carries the full input** (self-contained in the Trigger
  dashboard) and the run row stores the same `input` — the row is the record,
  the payload is the job.
- **Every column type is runnable**; the answer shape follows the type
  (`formula` → string, `audio`/`file`/`url` → URL). `json` uses free JSON:
  Gemini rejects `additionalProperties`. `generateObject` is deprecated in
  ai@7, hence `generateText` + `Output`.
- **No Trigger retries** — a retry after `fail` would revive a terminal row;
  `markRunning` refuses terminal rows for the same reason, and `onFailure`
  covers a kill the catch cannot see.
- **Audio, file and website cells are attached as files** (user's
  direction, revising an earlier "URL as text" call): the worker fetches
  each http(s) value itself (≤ 15 MB, 30 s, media type from the response or
  the extension — `src/ai/cell-attachments.ts`) and sends the bytes as file
  parts of the user message, so Gemini hears the voice note and reads the
  document or page. A link that cannot be fetched becomes a note on its
  prompt line rather than a failed run, and `result.attachments` records
  what travelled and what did not. Fetched in the worker, not at enqueue
  time, so the payload and the run row never carry bytes.
- **Run stays enabled while live** (user's choice): another AI cell can run
  meanwhile; the same cell cannot until its run finishes, and then it can be
  run again — each run is a new row.
- **`credit` stays 0**; token usage is recorded in `result.usage` until
  credit accounting is a requirement.
- **Removed `POST /run-ai/test`** (user's choice): real runs exist.

## Risks / open questions

- A run that completes before the stream connects is not replayed (first
  connect has no `lastEventId`); the seeded capsule shows, and the value
  lands on the next load. Rare at LLM latency.
- A worker that dies without `onFailure` leaves a `running` row and a busy
  cell until a stale-run sweep exists.
- `TRIGGER_SECRET_KEY` must be in `apps/api/.env` and the CLI account must
  see the project; the worker needs `DATABASE_URL` and the Gemini key.

---

## Outcome

- **Shipped:** everything above. Backend: `modules/run-ai/{schema,errors,service}.ts`,
  `trpc/routers/run-ai.ts` (`runCell`), `modules/spreadsheet/{schema,shape,service}.ts`
  (`sheetRowCellSchema`, `buildRowCells`, `rowCells`), `common/errors.ts`
  (`describeError`), `jobs/run-ai-dispatch.ts`, `main.ts`,
  `ai/{cell-prompt,cell-output}.ts`, `trigger/run-ai-cell.ts`,
  `trigger.config.ts`, `.env.example`; deleted `trigger/gemini-test.ts`,
  `modules/run-ai/run-ai.controller.ts`. `run-ai.api.test.ts`: 42 tests.
  Frontend: files listed above; `messages/en.json`.
- **Deviated:** `markRunning` throws a new `RunAiFinishedError` (conflict)
  on a terminal row rather than `RunAiNotFoundError`; the revive-refusal test
  moved to `setStatus`. The `trigger:dev` script pins the CLI to the SDK's
  version (`npx trigger.dev@4.5.15 dev`): `@latest` (4.5.16) aborts on the
  version mismatch with the pinned `@trigger.dev/*` packages.
- **Verified live:** with `bun dev` + `trigger:dev`, Run was disabled on a
  plain cell and enabled on an AI cell; a click showed "Starting...", then a
  disabled Run while the run worked, then re-enabled once the stream closed;
  the worker completed runs in ~2.5 s and the cell showed the typed output;
  `result.input.row.cells` followed the sheet's reordered sort order and
  `result.output`, `model`, `usage` were stored. The Prisma "modern"
  extension bundled the worker without `build.external`.
- **Not done:** batches / sequencing, credit accounting, a stale-run sweep.
  Attachments are inline bytes only (no Gemini Files API upload for media
  past the inline cap).
- **Docs updated:** `docs/features/run-ai.md`, `docs/features/spreadsheet.md`,
  `docs/routes/ai-spreadsheet.md`, `ARCHITECTURE.md`, `AGENTS.md`, the
  contract header of `run-ai.api.test.ts`.
