# CLAUDE.md

Guidance for AI coding agents (Claude Code and others) working in this repository.

## What this is

A Bun + Turborepo TypeScript monorepo skeleton: Next.js web app + Hono/tRPC API.
A future `apps/mobile` (Expo) can be added later — the `apps/*` workspace glob and
turbo `.expo/**` build outputs already cover it.

## Layout

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/api` | `@repo/api` | Hono + tRPC 11 + OpenAPI API server, port **3003**, Bun runtime |
| `apps/dashboard` | `@repo/dashboard` | Next.js 16 App Router web app, port **3001** |
| `packages/ui` | `@repo/ui` | shadcn/Radix component library + Tailwind preset |
| `packages/db` | `@repo/db` | Drizzle ORM: client, schema, migrations |
| `packages/supabase` | `@repo/supabase` | Supabase auth clients (server/client/middleware) |
| `packages/trpc` | `@repo/trpc` | Shared tRPC client helpers (internal service-to-service client) |
| `packages/logger` | `@repo/logger` | Pino logger |
| `packages/encryption` | `@repo/encryption` | AES/jose encryption helpers (needs `APP_ENCRYPTION_KEY`) |
| `packages/health` | `@repo/health` | Health-check probes/checker used by `/health/*` endpoints |
| `packages/utils` | `@repo/utils` | Small shared utilities |
| `packages/tsconfig` | `@repo/tsconfig` | Shared tsconfig bases (`base.json`, `nextjs.json`, `react-library.json`) |

## Commands

```bash
bun install                 # install all workspaces
bun dev                     # run api + dashboard in parallel
bun run dev:api             # api only (http://localhost:3003, Scalar docs at /)
bun run dev:dashboard       # dashboard only (http://localhost:3001)
bunx turbo typecheck        # typecheck all workspaces
bunx turbo lint             # biome lint (bunx turbo lint:fix to autofix)
bun run format              # biome format --write
bunx turbo build            # build everything
bunx turbo test             # run tests (bun test)
```

Run single-workspace commands with turbo filters, e.g. `bunx turbo typecheck --filter=@repo/api`.

## Conventions

- **Formatting/linting is Biome** (`biome.json`), not ESLint/Prettier. Run `bun run format` before committing.
- **Dependency versions**: shared deps are pinned in the root `package.json` `"catalog"` field;
  workspace packages reference them as `"react": "catalog:"`. Add new shared deps to the catalog.
  Workspace-internal deps use `"@repo/x": "workspace:*"`.
- **Path aliases**: `@api/*` → `apps/api/src/*` (inside the api app), `@/*` → `src/*` (inside dashboard).
- **New package**: create `packages/<name>` with a `package.json` (`"name": "@repo/<name>"`) and a
  `tsconfig.json` extending `@repo/tsconfig/base.json`. The workspace glob picks it up — no registration needed.

## tRPC pattern (api → dashboard type flow)

1. Add a router file in `apps/api/src/trpc/routers/<name>.ts` using
   `createTRPCRouter` + `publicProcedure` / `protectedProcedure` / `internalProcedure` from `../init`.
2. Register it in `apps/api/src/trpc/routers/_app.ts` (`appRouter`).
3. Types flow to the dashboard automatically via the `@repo/api` package export
   (`./trpc/routers/_app`). In client components: `const trpc = useTRPC()` from `@/trpc/client`,
   then `useQuery(trpc.<name>.<proc>.queryOptions(input))`.
4. `_app.ts` must keep exporting `AppRouter`, `RouterInputs`, `RouterOutputs`.

REST endpoints (OpenAPI-documented) live in `apps/api/src/rest/routers/` using
`createRoute` from `@hono/zod-openapi`; zod schemas in `apps/api/src/schemas/`.

## Database workflow (Drizzle)

1. Edit `packages/db/src/schema.ts`.
2. From `packages/db`: `bunx drizzle-kit generate` (creates SQL in `packages/db/migrations/`).
3. Apply with `bunx drizzle-kit migrate` (or `push` for dev).
4. Local test DB: `docker compose -f docker-compose.test.yml up -d` (Postgres+pgvector on port 5433).

## Auth model

- Dashboard authenticates users via Supabase; the tRPC client attaches the Supabase JWT as
  `Authorization: Bearer <token>`.
- The api verifies JWTs in `apps/api/src/utils/auth.ts` (JWKS) and builds the tRPC context in
  `apps/api/src/trpc/init.ts`. `protectedProcedure` requires a session.
- Service-to-service calls use `x-internal-key` (`INTERNAL_API_KEY`) with `internalProcedure`
  and the client in `packages/trpc/src/internal.ts`.

## Environment

Copy `apps/api/.env.example` and `apps/dashboard/.env.example` to `.env` in each app.
Key vars: `DATABASE_URL`, `SUPABASE_URL`/`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_API_ORIGINS`,
`INTERNAL_API_KEY`, `APP_ENCRYPTION_KEY` (64-char hex).
Build-time pass-through env vars are listed in `turbo.json` → add new ones there too.

## Verification checklist for changes

1. `bunx turbo typecheck lint` passes.
2. `bunx turbo test` passes (api has a smoke test in `apps/api/src/__tests__/`).
3. For cross-app changes: boot `bun dev` and check the dashboard landing page still
   renders the live `example.hello` response (proves the tRPC round trip).
