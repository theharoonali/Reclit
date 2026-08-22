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

- `apps/api/src/__tests__/smoke.test.ts` (run with `bun test` / `bunx turbo test`)
  boots the real app composition via `createApp()` on an ephemeral port and checks
  `/health` (asserting `ok` or `degraded` to match actual DB reachability) and,
  when the database is up, `note.list` over the mounted tRPC adapter.
- `apps/api/src/__tests__/note.test.ts` exercises the full `note` CRUD through a
  direct tRPC caller against a real database: create, read, list, partial update,
  validation failure, `NOT_FOUND`, and delete. It **skips itself** when
  `pingDatabase()` fails, so a checkout without a reachable `DATABASE_URL` still
  passes. It cleans up the rows it creates.
- Note: `expect(promise).rejects.toThrow(/regex/)` hangs against `TRPCError`
  rejections in bun 1.3.9 — assert on `TRPCError.code` in a try/catch instead
  (see `expectTRPCError` in that file).
- The dashboard has no tests yet; its `test` script no-ops until a `*.test.ts` exists.

## CI

`.github/workflows/ci.yml`: lint → typecheck → test → build on every push to
`main` and every PR. The Prisma client is generated automatically — `db:generate`
is a Turbo dependency of `typecheck`, `test`, `build`, and `dev`, and also runs as
`apps/api`'s `postinstall`. CI has no database, so the note tests skip there.

## Timeouts

SSR-side tRPC fetches abort after 8s (`apps/dashboard/src/trpc/server.tsx`).
