# Backend Rules

`apps/api` — NestJS 11 on Bun, tRPC 11, Prisma + Postgres.
Shared rules: [COMMON.md](COMMON.md). Tests: [TESTING.md](TESTING.md).

**Before writing backend code, read the feature's doc in
[`docs/features/`](../features/index.md)** — table, service, and procedures are
all described there. Copy `src/modules/note/` for anything new.

## Where code goes

One folder per feature. Same feature name everywhere, singular.

```
apps/api/src/
├── modules/<feature>/
│   ├── <feature>.schema.ts      # zod schemas + inferred types      (no NestJS)
│   ├── <feature>.service.ts     # all DB access + business logic    (no NestJS)
│   ├── <feature>.errors.ts      # named domain errors (only if >1)  (no NestJS)
│   ├── <feature>.controller.ts  # REST — only if a non-tRPC consumer needs it
│   └── <feature>.module.ts      # only alongside a controller
├── trpc/
│   ├── init.ts                  # context, procedures, error mapping
│   └── routers/<feature>.ts     # validate + delegate. No DB access.
├── common/                      # shared across ≥2 features (see "No repetition")
├── db/prisma.ts                 # the ONLY Prisma client
├── app.controller.ts            # the ONLY app-level REST route (GET /health)
└── __tests__/<feature>.api.test.ts   # the API contract (TESTING.md)
```

Layer responsibilities, and nothing else:

| Layer | Does | Never does |
| --- | --- | --- |
| schema | describes shapes, validation, defaults | imports the service or prisma |
| service | DB access, business rules, throws domain errors | imports tRPC or NestJS types |
| router | `.input()`, calls one service method, maps errors | queries the database, transforms shapes |
| controller | same as router, for REST | anything a service should do |

If a router body is longer than ~5 lines, the logic belongs in the service.

## Hard rules

1. **`src/trpc/**` must not import `@nestjs/*` or any decorated class.** The
   dashboard transpiles that import graph; decorators break the Next build.
   This is why services are plain classes with a singleton export.
2. **Never `import type` a class NestJS constructor-injects.**
   `verbatimModuleSyntax` erases it and DI silently receives `undefined`.
   Biome's `useImportType` is disabled for `apps/api/**` for exactly this reason.
3. Services own the database. Routers and controllers must not touch `prisma`.
4. Services return schema-shaped objects via an explicit `select` — never raw
   Prisma models.
5. `_app.ts` must keep exporting `AppRouter`, `RouterInputs`, `RouterOutputs`.
6. Every procedure appears in the feature's `*.api.test.ts` contract before it is
   considered to exist.

## No repetition

The backend's duplication always shows up in the same five places. Handle each
the same way, every time:

| Repeated thing | Where the single copy lives |
| --- | --- |
| the field list a feature returns | one `const <feature>Select = {...}` in `<feature>.service.ts`, used by every method |
| id / pagination / sort inputs | `src/common/schema.ts` — `idInput`, `paginationInput`; features `.extend()` them |
| domain error → tRPC code mapping | one `mapDomainError` in `src/trpc/init.ts`; routers do not write per-procedure `try/catch` |
| "find it or throw" | one private `getOrThrow(id)` per service, called by `byId`/`update`/`remove` |
| test setup (caller, error assertions, cleanup) | `src/__tests__/support/` — never re-declare a helper in a test file |

Two services needing the same non-trivial helper means it moves to
`src/common/`. Two features needing the same *business* rule means one of them
should be calling the other's service, not re-implementing it.

Copy-pasting a service and renaming the model is the one thing you may not do —
the second CRUD feature is where shared shapes get extracted, not duplicated.

## Errors

- Services throw plain named errors (`NoteNotFoundError`) — never framework types
  and never a bare `Error("not found")`.
- Name them `<Feature><Reason>Error` and give each a stable `code` the router can
  map without string matching.
- Routers map domain errors to `TRPCError` through the shared mapper; controllers
  map them to Nest `HttpException`.
- Every mapped error code must be listed in the contract header and covered by a
  test ([TESTING.md](TESTING.md)).
- Input validation is Zod, automatic in tRPC via `.input()`. Never validate the
  same rule twice in the service — trust the schema.

## Database

```bash
bun run --filter=@reclit/api db:generate   # regenerate the client after a schema edit
bun run --filter=@reclit/api db:migrate    # create + apply a migration (dev)
bun run --filter=@reclit/api db:deploy     # apply existing migrations (prod/CI)
```

- Models live in `apps/api/prisma/schema.prisma`. One migration per schema change,
  via `db:migrate`. Never hand-edit the database or an already-applied migration.
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
3. `modules/<feature>/<feature>.service.ts`
4. `trpc/routers/<feature>.ts` + register in `trpc/routers/_app.ts`
5. `__tests__/<feature>.api.test.ts` — contract header + full coverage
6. `docs/features/<feature>.md` from [`_template.md`](../features/_template.md),
   row added to [`docs/features/index.md`](../features/index.md)

Use the `backend-feature` skill; it walks these six steps with the code shapes.
