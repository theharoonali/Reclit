# Reliability

## Health checks

`GET /health` (`apps/api/src/app.controller.ts`) runs `SELECT 1` against Postgres
via `pingDatabase()` (`apps/api/src/db/prisma.ts`) and returns:

- `200 { "status": "ok", "db": "ok" }` when the database answers
- `503 { "status": "degraded", "db": "down" }` when it does not

## Lifecycle

- The Postgres pool is closed on shutdown by `PrismaModule`
  (`apps/api/src/db/prisma.module.ts`), which runs on `app.close()` and — because
  `main.ts` calls `enableShutdownHooks()` — on SIGINT/SIGTERM.
- The run-ai change feed (`apps/api/src/modules/run-ai/run-ai.feed.ts`) opens
  its `LISTEN` connection when the Nest app boots (`RunAiModule`) and closes
  it on shutdown. The api still boots if that connection fails; the first
  subscription retries it. A dropped connection reconnects with exponential
  backoff (0.5 s → 30 s) and emits `resync`, so every open stream re-sends its
  snapshot and no client shows a stale working run.
- The Trigger.dev task `run-ai-cell` has no retries (a retry would revive a
  terminal run); its `onFailure` marks the run `failed` when the task is
  killed, so a cell is never left busy by a crash.

## Tests

How to write them: [rules/TESTING.md](rules/TESTING.md).

- `apps/api/src/__tests__/smoke.test.ts` boots the real app composition
  (`startTestServer`, an ephemeral port) and checks `/health` against actual
  database reachability and, when the database is up, `spreadsheet.list` over
  the mounted tRPC adapter.
- `apps/api/src/__tests__/<feature>.api.test.ts` is the feature's API contract:
  its header documents every payload, response, and error code, and the suite
  proves them against a real database through a tRPC caller.
- Contract suites **skip themselves** when `pingDatabase()` fails, so a checkout
  without a reachable `DATABASE_URL` still passes. They clean up the rows they create.
- Shared helpers live in `apps/api/src/__tests__/support/`.
- Dashboard tests live in `apps/dashboard/tests/` (pure helpers and painters).

The Prisma client is generated automatically before these run: `db:generate` is a
Turbo dependency of `typecheck`, `test`, `build`, and `dev`, and also runs as
`apps/api`'s `postinstall`.

## Timeouts

- SSR-side tRPC fetches abort after 8 s (`apps/dashboard/src/trpc/server.tsx`).
- tRPC SSE pings every 15 s; a client silent for 45 s reconnects
  (`apps/api/src/trpc/init.ts`).
- Attachment fetches in the worker abort after 30 s and refuse files over
  15 MB (`apps/api/src/ai/cell-attachments.ts`); the task itself has a
  120 s `maxDuration`.
