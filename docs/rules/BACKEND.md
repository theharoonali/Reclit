# Backend Rules

`apps/api` — NestJS 11 on Bun, tRPC 11, Prisma + Postgres, Trigger.dev tasks.
Shared rules: [COMMON.md](COMMON.md). Tests: [TESTING.md](TESTING.md).

**Before writing backend code, read the feature's doc in
[`docs/features/`](../features/index.md)** — table, service, and procedures are
all described there. Copy the shape of an existing feature in `src/modules/` for
anything new.

## Where code goes

One folder per feature. Same feature name everywhere, singular.

```
apps/api/src/
├── main.ts                      # createApp + dispatcher registration + listen
├── bootstrap.ts                 # NestFactory + CORS + DomainErrorFilter + tRPC mount (tests boot this)
├── app.module.ts                # imports every feature module
├── app.controller.ts            # the ONLY app-level REST route (GET /health)
├── modules/<feature>/
│   ├── <feature>.schema.ts      # zod schemas + inferred types              (no NestJS)
│   ├── <feature>.service.ts     # DB access + business logic, one singleton (no NestJS)
│   ├── <feature>-<part>.service.ts  # a second service when one would pass the size cap (spreadsheet-cells, run-ai-changes)
│   ├── <feature>.errors.ts      # named domain errors (as soon as >1)        (no NestJS)
│   ├── <feature>.shape.ts       # pure record → wire assembly, when the service would repeat it
│   ├── <feature>.ids.ts         # deterministic scoped ids, when the feature has them
│   ├── <feature>.feed.ts        # a LISTEN/NOTIFY feed for live updates      (no NestJS)
│   ├── <feature>.controller.ts  # REST — only if a non-tRPC consumer needs it
│   └── <feature>.module.ts      # only alongside a controller or a Nest lifecycle hook
├── trpc/
│   ├── init.ts                  # context, procedures, sse options, mapDomainError
│   └── routers/<feature>.ts     # validate + delegate. No DB access.
├── common/                      # shared across ≥2 features (see "No repetition")
├── db/prisma.ts                 # the ONLY Prisma client (+ pingDatabase, toJsonInput)
├── db/prisma.module.ts          # its Nest shutdown hook
├── ai/                          # Vercel AI SDK providers + pure prompt/output helpers
├── jobs/<feature>-dispatch.ts   # API-side Trigger.dev client: the ONLY `tasks.trigger` caller
├── trigger/<task>.ts            # Trigger.dev tasks, one exported task per file (bundled by the CLI)
└── __tests__/
    ├── support/                 # caller, expectError, startTestServer, fixtures
    └── <feature>.api.test.ts    # the API contract (TESTING.md)
```

Layer responsibilities, and nothing else:

| Layer | Does | Never does |
| --- | --- | --- |
| schema | describes shapes, validation, defaults | imports the service or prisma |
| service | DB access, business rules, throws domain errors | imports tRPC, NestJS or `@trigger.dev/sdk` |
| router | `.input()`, calls one service method, maps errors | queries the database, transforms shapes |
| controller | same as router, for REST | anything a service should do |
| task (`src/trigger/`) | calls services, logs, returns | is imported by anything in `src/` except type-only from `src/jobs/` |
| job client (`src/jobs/`) | registers a service hook that calls `tasks.trigger` | is imported from anywhere but `src/main.ts` |

If a router body is longer than ~5 lines, the logic belongs in the service.

## Hard rules

1. **`src/trpc/**` and `src/modules/**` must not import `@nestjs/*`,
   `@trigger.dev/sdk` or any decorated class.** The dashboard transpiles that
   import graph; decorators break the Next build. This is why services are
   plain classes with a singleton export, and why enqueuing a job goes through
   a hook (`setDispatcher`) that `src/jobs/` registers from `src/main.ts`.
2. **Never `import type` a class NestJS constructor-injects.**
   `verbatimModuleSyntax` erases it and DI silently receives `undefined`.
   Biome's `useImportType` is disabled for `apps/api/**` for exactly this reason.
3. Services own the database. Routers, controllers and tasks must not touch
   `prisma`.
4. Services return schema-shaped objects via an explicit `select` — never raw
   Prisma models. An internal record type is
   `Prisma.<Model>GetPayload<{ select: typeof <x>Select }>`, never hand-written.
5. `_app.ts` must keep exporting `AppRouter`, `RouterInputs`, `RouterOutputs`.
6. Every procedure appears in the feature's `*.api.test.ts` contract before it is
   considered to exist.
7. Tests boot `bootstrap.ts`, never `main.ts`: nothing registered from `main.ts`
   (the dispatcher) may be needed for a contract to pass.

## No repetition

The backend's duplication always shows up in the same places. Handle each the
same way, every time:

| Repeated thing | Where the single copy lives |
| --- | --- |
| the field list a feature returns | one `const <feature>Select = {...}` in `<feature>.service.ts`, used by every method |
| id / pagination / sort inputs | `src/common/schema.ts` — `idInput`, `paginationInput`; features `.extend()` them |
| domain error → tRPC code mapping | one `mapDomainError` in `src/trpc/init.ts`; routers `.catch(mapDomainError)`, never per-procedure `try/catch` |
| Prisma error codes (`P2002`, `P2025`, …) | `src/common/prisma-errors.ts` — `isUniqueViolation`, `isRecordNotFound`, `isForeignKeyViolation`. A raw `"P####"` string anywhere else is a bug |
| a JSON column write | `toJsonInput` in `src/db/prisma.ts` — never a local `as Prisma.InputJsonValue` |
| an error reduced to text (logs, `result.error`) | `describeError` in `src/common/errors.ts` — never `error instanceof Error ? error.message : …` |
| a feature's domain errors | `<feature>.errors.ts` as soon as there are two — never declared inline in the service |
| multipart upload plumbing | `src/common/upload.ts` — `@UploadFile()` + `requireFile()`; the framework-free half (`MulterFile`, `MAX_UPLOAD_BYTES`) is `src/common/multipart.ts` |
| "find it or throw" | one `byId` (or private `getOrThrow`) per service, called by every method that needs the row |
| a write repeated in two methods | a module-level builder returning the un-awaited `PrismaPromise`, so it still batches in `$transaction([...])` (see `spreadsheet-cells.service.ts`) |
| test setup (caller, error assertions, server, cleanup) | `src/__tests__/support/` — `caller`, `expectError`, `expectTRPCError`, `startTestServer`, fixtures. Never re-declare a helper in a test file |

Two services needing the same non-trivial helper means it moves to
`src/common/`. Two features needing the same *business* rule means one of them
should be calling the other's service, not re-implementing it.

Copy-pasting a service and renaming the model is the one thing you may not do —
the second CRUD feature is where shared shapes get extracted, not duplicated.

## Splitting a service

A file holds one responsibility and stays near the size cap
([COMMON.md](COMMON.md) §5). When a feature outgrows that, add
`<feature>-<part>.service.ts` with its own class and singleton, and let it call
the base service for lookups rather than re-implementing them:

| Feature | Base | Split off |
| --- | --- | --- |
| spreadsheet | `spreadsheet.service.ts` (reads, lifecycle, `columnOrThrow`, `columnsOf`) | `-cells` (row/cell writes), `-columns` (column writes), `-import` (full-grid rebuild) |
| run-ai | `run-ai.service.ts` (run lifecycle, reads) | `-batch` (what a Run click runs: plan, insert, waves, the dispatcher hook, `prepare`), `-changes` (the SSE stream: pump, snapshot, generator) |

## Errors

- Services throw plain named errors extending `DomainError`
  (`src/common/errors.ts`) with a `kind` and a stable `code` — never framework
  types and never a bare `Error("not found")`.
- Name them `<Feature><Reason>Error`; the router maps `kind`, the client reads `code`.
- Routers map domain errors to `TRPCError` through `mapDomainError`;
  controllers get the same mapping from the global `DomainErrorFilter`.
- **The two kind-maps are deliberate twins, not duplication.** `KIND_TO_TRPC`
  (`src/trpc/init.ts`) and `KIND_TO_STATUS` (`src/common/domain-error.filter.ts`)
  cannot be merged: the filter imports `@nestjs/common`, and hard rule 1 forbids
  that anywhere in the `src/trpc/**` import graph. Both are exhaustive
  `Record<DomainErrorKind, …>`, so adding a kind fails typecheck in both places.
- Every mapped error code must be listed in the contract header and covered by a
  test ([TESTING.md](TESTING.md)).
- Input validation is Zod, automatic in tRPC via `.input()` and explicit
  (`schema.parse`) in controllers. Never validate the same rule twice in the
  service — trust the schema.

## Background jobs and AI

- A task (`src/trigger/<task>.ts`, `schemaTask` with a zod payload) calls
  services and never the reverse. The API enqueues through a hook: the service
  exposes `setDispatcher`, `src/jobs/<feature>-dispatch.ts` registers it from
  `src/main.ts`. Without a dispatcher (tests) the work simply stays pending.
- Model providers and pure prompt/output helpers live in `src/ai/`. Pure
  helpers are covered by the feature's contract test without an API key.
- Live updates: a Postgres trigger `NOTIFY`s row ids, `<feature>.feed.ts`
  holds the one `LISTEN` connection per process, and a `-changes` service
  resolves ids into rows and yields `tracked()` events from an async generator
  the router exposes as a subscription. `run-ai` is the worked example.

## Database

```bash
bun run --filter=@reclit/api db:generate   # regenerate the client after a schema edit
bun run --filter=@reclit/api db:migrate    # create + apply a migration (dev)
bun run --filter=@reclit/api db:deploy     # apply existing migrations (prod/CI)
bun run --filter=@reclit/api db:seed       # seed through the services (idempotent)
```

- Models live in `apps/api/prisma/schema.prisma`. One migration per schema change,
  via `db:migrate`. Never hand-edit the database or an already-applied migration.
- What the schema cannot express (partial unique indexes, triggers) goes in the
  migration SQL and is described in the feature doc.
- `DATABASE_URL` lives in `apps/api/.env` (gitignored); `prisma.config.ts` reads it.
- Model naming: `PascalCase` singular model, `camelCase` fields, `id` is a
  `String @default(uuid())`, always `createdAt`/`updatedAt`.
- Index every column a list query sorts or filters on.
- **The table's columns are documented in its feature doc**
  ([`docs/features/<feature>.md`](../features/index.md)) and in the contract test
  header — both updated in the same change as the migration.

## Adding a feature

1. `prisma/schema.prisma` model + `db:migrate`
2. `modules/<feature>/<feature>.schema.ts`
3. `modules/<feature>/<feature>.errors.ts` + `<feature>.service.ts`
4. `trpc/routers/<feature>.ts` + register in `trpc/routers/_app.ts`
5. `__tests__/<feature>.api.test.ts` — contract header + full coverage
6. `docs/features/<feature>.md` from [`_template.md`](../features/_template.md),
   row added to [`docs/features/index.md`](../features/index.md)

Use the `backend-feature` skill; it walks these six steps with the code shapes.
