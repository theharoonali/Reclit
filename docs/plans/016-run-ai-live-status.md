# 016 — Live run status in the sheet (tRPC SSE) + `POST /run-ai/test`

**Status:** implemented
**Scope:** full feature

## Goal

While an AI run works a cell, the sheet shows it live: a capsule in the cell
labelled with the run's status — `pending`, `running`, or any custom stage the
backend reports such as `analyzing` — with a dot whose halo breathes. When the
run reaches `completed` the capsule goes and the cell shows the run's
`result.output`, which the API has already written into the Cell row; `failed`
only clears the capsule. A REST test endpoint drives the whole thing with plain
POSTs before real AI execution exists. Runs will be written by Trigger.dev
tasks — a separate process — so the signal comes from Postgres, not from
in-process events.

## Backend (Agent 1)

- **Table:** `RunAi.status` becomes free text (enum dropped; uppercase in the
  database, lowercase on the wire; `COMPLETED` / `FAILED` terminal);
  `spreadsheetId` added (derived from `cellId`, indexed with `updatedAt`).
  Migration `run_ai_status_text_and_feed` also adds the partial unique index
  `RunAi_active_cell_key` (one working run per cell) and the trigger
  `run_ai_notify` → `pg_notify('run_ai_changed', id)`.
- **Procedures:** `runAi.onChange` — subscription `{ spreadsheetId,
  lastEventId? }` → tracked `RunAiChange` (`snapshot` | `run`); BAD_REQUEST.
  REST `POST /run-ai/test` — create (no `id`, 201) or transition (`id` +
  `status`, 200); 400 / 404 / 409.
- **Service methods:** `create` (derives `spreadsheetId`, maps the unique
  violation to `RunAiCellBusyError`), `setStatus` (any stage), `complete`
  (writes `result.output` into the cell via `spreadsheetCellsService.setCell`
  *before* flipping the run), `listActiveBySpreadsheet`, `listChangedSince`,
  `upsertForTest`, `changes` (the async generator: feed first, replay,
  snapshot, live). `run-ai.feed.ts` holds the `pg` LISTEN connection.
- **Stream lifecycle (added after review — "the stream should not always be
  open"):** `runAi.listActive` (the sheet's working runs) and a `closed`
  event: `onChange` ends itself when a terminal event leaves no working run.
  No state is stored for this — the runs are the state. (A `RunAiSession`
  table with open/close procedures was built first and then removed in the
  same review: migrations `run_ai_session` and `drop_run_ai_session`.)
- Reused: `isUniqueViolation`, `cellValueSchema` (for `result.output`),
  `spreadsheetCellsService.setCell`, the `createApp` + `fetch` REST test idiom,
  the `PrismaModule` lifecycle shape for the feed.

## Frontend (Agent 2)

- **Route:** `/ai-spreadsheet`, unchanged URL.
- **Components:** `use-sheet-runs.ts` (new hook: `useSubscription` on
  `runAi.onChange`, runs in a ref, a 40 ms pulse interval while any run
  works), `paint-cell.ts` (a `run` branch before the empty-cell guard; the
  `"pulse"` capsule mark — solid dot plus a 30 % halo whose radius follows
  `sin(2π·phase)`), `paint-body.ts` (threads `runs` / `runPhase`),
  `use-sheet-canvas.ts` (wires the hook, passes `setCellLocal`),
  `run-status.ts` (known statuses, `formatRunStatus`), `run-state.ts`
  (`applyRunChange`, the pure reducer), `short-ids.ts` (`parseScopedCellId`).
  `trpc/client.tsx` gains `splitLink` → `httpSubscriptionLink`.
- **Lifecycle:** `use-run-listening.ts` (listening = Run was clicked, or
  `listActive` is non-empty; `closed` clears both) and
  `ai-spreadsheet-run-button.tsx` (Run, then Live and inert).
  `use-sheet-runs.ts` subscribes only while listening and clears every
  capsule on `closed`.
- **States:** pending grey (`muted-foreground`), running green (`success`),
  any custom stage orange (`primary`); the chip is borderless (tinted fill +
  dot only, user's choice); completed / failed never painted. Four
  message keys under `aiSpreadsheet.run.*`; custom stages are data, tidied
  by `formatRunStatus`.

## Integration (Agent 3)

- `useSheetRuns` → `runAi.onChange`; a `completed` event writes
  `result.output` into the model with `setCellLocal` (no query invalidation —
  the API wrote the Cell row before sending the event, so model and database
  already agree). A reload gets the persisted values from `spreadsheet.rows`
  and the working runs from the snapshot.

## Decisions

- **tRPC subscription over a Nest `@Sse` route** (user's choice): typed end
  to end, built-in reconnect with `Last-Event-ID`, pings, `useSubscription`.
  The `sse` options live on `initTRPC.create`, not the express adapter.
- **Postgres `NOTIFY` from a trigger, not in-process emit:** the writers
  include the Trigger.dev worker, and several API replicas may run; one
  mechanism covers every process. Only the id is notified (8000-byte payload
  cap) and the service re-reads the row once per process.
- **Status as free text** (user's choice) over enum + `stage` column: one
  field, the four known values stay constants, custom stages need no
  migration. Terminal set is fixed to `completed` / `failed`.
- **The API writes the cell on `complete`** (user's choice), cell first and
  run second, so a partial failure is retry-safe and the event describes a
  persisted cell. `result.output` is the value (user's choice).
- **Partial unique index, not a service check**, enforces one working run per
  cell — race-free; the service only maps the violation to a 409.
- **No `lastEventId` seeded from `localStorage` on page load** — planned,
  then dropped: replaying old `completed` events after a reload would apply
  stale outputs over cells edited since, while the loader's `spreadsheet.rows`
  already carries every persisted output. tRPC keeps `lastEventId` for
  reconnects within a session, which is where replay matters.
- **The stream is a generation, not a socket** (user's direction, modelled on
  a chat reply): it is open exactly while the sheet has a working run. That
  is derived from the runs table rather than stored — the user rejected a
  session table as needless state — so a reload resumes by asking
  `listActive`, the Run button opens the stream ahead of the first run, and
  the server ends it with an explicit `closed` event when the last working
  run finishes (explicit rather than relying on how the SSE link treats a
  server-completed stream, so the client tears down before any reconnect).
- The pulse is a `setInterval` (40 ms), not a permanent rAF loop, and runs
  only while a run is working — the caret blink's shape.
- Capsule colours reuse existing tokens; no new design token. `pg` and
  `@types/pg` are now direct dependencies of `apps/api`.
- Supersedes plan 015's "reads-only router" decision (a write exists now, as
  REST, for testing).

## Risks / open questions

- The feed holds one extra Postgres connection per API process.
- Replay is capped at 500 rows per reconnect.
- A completion that lands between the loader's rows fetch and the
  subscription connecting is not replayed; the cell shows on the next load.
- Custom stages beyond `analyzing` all paint orange until a per-stage map is
  wanted.
- `bun test` boots the Nest app in several suites; each boot opens and closes
  the feed's LISTEN connection.

---

## Outcome

- **Shipped:** everything above. Backend: migration
  `20260902125351_run_ai_status_text_and_feed`, `modules/run-ai/*` (schema,
  errors, service, feed, controller, module), `trpc/routers/run-ai.ts`
  (`onChange`), `trpc/init.ts` (`sse` options), `bootstrap.ts`
  (`Last-Event-ID` CORS header), `spreadsheet.ids.ts` (`parseCellId`),
  `__tests__/run-ai.api.test.ts` (28 tests incl. the stream and REST),
  `__tests__/support/trpc.ts` (`callerWithSignal`, `nextTracked`). Frontend:
  `use-sheet-runs.ts`, `run-state.ts`, `run-status.ts`, `short-ids.ts`,
  `paint-cell.ts`, `paint-body.ts`, `use-sheet-canvas.ts`,
  `use-sheet-labels.ts`, `types.ts`, `geometry.ts`, `trpc/client.tsx`,
  `messages/en.json`; tests `paint-cell`, `run-state`, `run-status`,
  `short-ids`.
- **Deviated:** no `localStorage` seed for `lastEventId` (see Decisions);
  the feed emits ids and the service resolves them (the plan had the feed
  read rows, which would have made feed and service import each other).
- **Added in review:** borderless capsules with the label in the status
  colour; `POST /run-ai/test` transitions a cell's working run by `cellId`
  (and creates + completes in one call); the stream lifecycle
  (`runAi.listActive`, the `closed` event, self-ending stream),
  `use-run-listening.ts`, `ai-spreadsheet-run-button.tsx`. A session table
  was built and removed within the review (two migrations remain).
- **Not done:** the Run button enqueuing real runs; the Trigger.dev task
  that writes them; per-stage colours.
- **Docs updated:** `docs/features/run-ai.md`, `docs/routes/ai-spreadsheet.md`,
  contract header of `run-ai.api.test.ts`, `ARCHITECTURE.md`, `AGENTS.md`.
