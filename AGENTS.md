# AGENTS.md

Map for AI coding agents working in this repository. Short on purpose — deeper
sources of truth are linked at the bottom.

**Before touching a page, read its route doc in [docs/routes/](docs/routes/index.md).**
It lists every frontend and backend file behind that page, the APIs it calls, and
what is already implemented. Open the code only when the doc is insufficient —
then fix the doc. The rules you must follow live in
[docs/rules/](docs/rules/COMMON.md).

## What this is

A Bun + Turborepo TypeScript monorepo template: Next.js web app + NestJS API,
connected end-to-end with tRPC. It intentionally contains exactly one example of
each pattern — one CRUD feature (`Note`), one feature component
(`notes-panel.tsx`), one shared package (`@reclit/ui`, exporting one component) —
so you can copy the pattern to build features. `Note` at `/` is the reference
vertical slice: Postgres → Prisma → service → tRPC → UI. There is no auth yet.

## Layout

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/api` | `@reclit/api` | NestJS API server (Bun runtime), port **4001**, tRPC mounted at `/trpc`, Prisma + Postgres |
| `apps/dashboard` | `@reclit/dashboard` | Next.js 16 App Router web app, port **4000** |
| `packages/ui` | `@reclit/ui` | The one shared package: `Button` + `cn` + Tailwind preset |

## Commands

```bash
bun install                 # install all workspaces
bun dev                     # run api + dashboard in parallel
bun run dev:api             # api only (http://localhost:4001)
bun run dev:dashboard       # dashboard only (http://localhost:4000)
bunx turbo typecheck        # typecheck all workspaces
bunx turbo lint             # biome lint (bunx turbo lint:fix to autofix)
bun run format              # biome format --write
bunx turbo build            # build everything
bunx turbo test             # run tests (bun test; api smoke + note CRUD)
bun run --filter=@reclit/api db:generate   # regenerate the Prisma client
bun run --filter=@reclit/api db:migrate    # create + apply a migration
```

Filter to one workspace: `bunx turbo typecheck --filter=@reclit/api`.

## Conventions

- **Formatting/linting is Biome** (`biome.json`), not ESLint/Prettier. Run `bun run format` before committing.
- **Dependency versions**: shared deps are pinned in the root `package.json` `"catalog"`
  field; workspace packages reference them as `"react": "catalog:"`. Workspace-internal
  deps use `"@reclit/x": "workspace:*"`.
- **Path aliases**: `@api/*` → `apps/api/src/*` (inside the api), `@/*` → `src/*` (inside dashboard).
- **New package**: use the `new-package` skill. Each workspace carries its own
  self-contained `tsconfig.json` — there is no shared tsconfig package.
- **Feature layout**: one folder per feature in `apps/api/src/modules/<feature>/`
  (`schema` + `service`) — see [docs/rules/BACKEND.md](docs/rules/BACKEND.md).
  Frontend feature components live in `apps/dashboard/src/components/` — see
  [docs/rules/FRONTEND.md](docs/rules/FRONTEND.md).
- **Database**: Prisma, schema at `apps/api/prisma/schema.prisma`, single client
  at `apps/api/src/db/prisma.ts`. `DATABASE_URL` lives in `apps/api/.env`.

## Hard invariants (breaking these causes confusing failures)

1. `apps/api/package.json` must keep exporting `"./trpc/routers/_app"` — it is the
   only type bridge to the dashboard.
2. Nothing under `apps/api/src/trpc/` may import `@nestjs/*` or any decorated class.
   The dashboard transpiles `@reclit/api` (Next `transpilePackages`), and decorator code
   breaks the Next build.
3. `apps/api/src/trpc/routers/_app.ts` must keep exporting `AppRouter`, `RouterInputs`,
   `RouterOutputs`.
4. In `apps/api`, never `import type` a class that NestJS constructor-injects —
   `verbatimModuleSyntax` erases the import and DI metadata becomes undefined at runtime.
   Biome's `useImportType` is disabled for `apps/api/**` so it cannot rewrite an
   injected class into an `import type` and silently break DI.
5. API dev uses `bun --watch`, not `bun --hot` (hot reload double-initializes Nest DI).
6. Services in `src/modules/` stay decorator-free (plain classes + a singleton
   export) so `src/trpc/` can import them.

## tRPC pattern (api → dashboard type flow)

1. Add a router in `apps/api/src/trpc/routers/<name>.ts` using `createTRPCRouter` +
   `publicProcedure` from `../init`.
2. Register it in `apps/api/src/trpc/routers/_app.ts`.
3. Consume in the dashboard: `const trpc = useTRPC()` from `@/trpc/client`, then
   `useQuery(trpc.<name>.<proc>.queryOptions(input))`.

REST endpoints are plain NestJS controllers — see `apps/api/src/app.controller.ts`
(the `/health` probe is the only one).

Anything touching the database goes through a service in
`apps/api/src/modules/<feature>/` — see [docs/rules/BACKEND.md](docs/rules/BACKEND.md).

## Verification checklist for changes

1. `bunx turbo lint typecheck` passes.
2. `bunx turbo test` passes (api tests in `apps/api/src/__tests__/`).
3. For cross-app changes: `bun dev`, then check `/` can create/edit/delete a note
   (proves the full tRPC + database round trip).
4. Update the affected [route doc](docs/routes/index.md) in the same change.

## Deeper docs

**Read first:**

- [docs/rules/COMMON.md](docs/rules/COMMON.md) — types, plans, docs, naming
- [docs/rules/BACKEND.md](docs/rules/BACKEND.md) — where services/routers go
- [docs/rules/FRONTEND.md](docs/rules/FRONTEND.md) — where components go, reuse, styling
- [docs/routes/index.md](docs/routes/index.md) — one doc per route: files, APIs, gaps

**Reference:**

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces connect, request/type flow
- [docs/FRONTEND.md](docs/FRONTEND.md) — dashboard structure as it stands
- [docs/generated/db-schema.md](docs/generated/db-schema.md) — database tables
- [docs/SECURITY.md](docs/SECURITY.md) — CORS and auth posture
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — health checks and testing
- [docs/PLANS.md](docs/PLANS.md) — how execution plans are tracked
- [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) — known intentional gaps
