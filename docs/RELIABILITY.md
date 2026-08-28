# Reliability

## Health checks

`GET /health` (`apps/api/src/app.controller.ts`) runs `SELECT 1` against Postgres
via `pingDatabase()` (`apps/api/src/db/prisma.ts`) and returns:

- `200 { "status": "ok", "db": "ok" }` when the database answers
- `503 { "status": "degraded", "db": "down" }` when it does not

The Postgres pool is closed on shutdown by `PrismaModule`
(`apps/api/src/db/prisma.module.ts`), which runs on `app.close()` and — because
`main.ts` calls `enableShutdownHooks()` — on SIGINT/SIGTERM.

## Tests

How to write them: [rules/TESTING.md](rules/TESTING.md).

- `apps/api/src/__tests__/smoke.test.ts` (run with `bun test` / `bunx turbo test`)
  boots the real app composition via `createApp()` on an ephemeral port and checks
  `/health` (asserting `ok` or `degraded` to match actual DB reachability) and,
  when the database is up, `spreadsheet.list` over the mounted tRPC adapter.
- `apps/api/src/__tests__/<feature>.api.test.ts` is the feature's API contract:
  its header documents every payload, response, and error code, and the suite
  proves them against a real database through a tRPC caller.
- Contract suites **skip themselves** when `pingDatabase()` fails, so a checkout
  without a reachable `DATABASE_URL` still passes. They clean up the rows they create.
- Shared helpers live in `apps/api/src/__tests__/support/`.
- The dashboard has no tests yet; its `test` script no-ops until a `*.test.ts` exists.

The Prisma client is generated automatically before these run: `db:generate` is a
Turbo dependency of `typecheck`, `test`, `build`, and `dev`, and also runs as
`apps/api`'s `postinstall`.

## Timeouts

SSR-side tRPC fetches abort after 8s (`apps/dashboard/src/trpc/server.tsx`).
