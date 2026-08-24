# Backend Rules

`apps/api` — NestJS 11 on Bun, tRPC 11, Prisma + Postgres.
Shared rules: [COMMON.md](COMMON.md).

## Where code goes

One folder per feature: `apps/api/src/modules/<feature>/`.

| File | Holds | NestJS allowed |
| --- | --- | --- |
| `<feature>.schema.ts` | Zod schemas + inferred types | no |
| `<feature>.service.ts` | All DB access and business logic; exports a plain class **and** a singleton | no |

Other locations:

| Path | Holds |
| --- | --- |
| `src/trpc/routers/<feature>.ts` | tRPC procedures — validate + delegate, no DB access |
| `src/db/prisma.ts` | The only Prisma client. Never call `new PrismaClient()` elsewhere |
| `src/app.controller.ts` | The only REST controller (`GET /health`) |
| `prisma/schema.prisma` | Models. One migration per schema change |

If a feature ever needs a REST surface, add `<feature>.controller.ts` +
`<feature>.module.ts` to its folder (a `@Module` binding the service singleton to
the class token with `useValue`) and register the module in `src/app.module.ts`.
The default is tRPC only.

## Hard rules

1. **`src/trpc/**` must not import `@nestjs/*` or any decorated class.** The
   dashboard transpiles that import graph; decorators break the Next build.
   This is why services are plain classes.
2. **Never `import type` a class NestJS constructor-injects.** `verbatimModuleSyntax`
   erases it and DI silently receives `undefined`. Biome's `useImportType` is
   disabled for `apps/api/**` in `biome.json` for exactly this reason.
3. Services own the database. Routers and controllers must not touch `prisma`.
4. Services return schema-shaped objects via an explicit `select` — never raw
   Prisma models.
5. `_app.ts` must keep exporting `AppRouter`, `RouterInputs`, `RouterOutputs`.

## Errors

- Services throw plain named errors (`NoteNotFoundError`) — no framework types.
- Routers map them to `TRPCError` (a controller would map them to Nest
  `HttpException`).
- Input validation is Zod, automatic in tRPC via `.input()`.

## Database

```bash
bun run --filter=@reclit/api db:generate   # regenerate the client after a schema edit
bun run --filter=@reclit/api db:migrate    # create + apply a migration (dev)
bun run --filter=@reclit/api db:deploy     # apply existing migrations (prod/CI)
```

- Schema changes go through `db:migrate`. Never hand-edit the database or an
  already-applied migration file.
- `DATABASE_URL` lives in `apps/api/.env` (gitignored); `prisma.config.ts` reads it.
- Update [`docs/generated/db-schema.md`](../generated/db-schema.md) when models change.

## Adding a feature

1. `schema.ts` → 2. `service.ts` → 3. tRPC router + register in `_app.ts` →
4. update the route doc in `docs/routes/`.

Copy `src/modules/note/` — it is the reference implementation.
