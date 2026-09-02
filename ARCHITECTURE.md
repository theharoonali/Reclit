# Architecture

## Overview

Two apps, one shared package, one type bridge, one database.

```
apps/dashboard (Next.js 16, port 4000)
  │  imports type AppRouter from "@reclit/api/trpc/routers/_app"   ← types only
  │
  │  HTTP: httpBatchStreamLink → http://localhost:4001/trpc
  ▼
apps/api (NestJS on Bun, port 4001)
  ├── /trpc/*   tRPC 11 express adapter, mounted in src/bootstrap.ts
  │             └── appRouter → spreadsheet.{list,byId,rows,setCell,…}
  └── /health   AppController (reports database reachability)
        │
        ▼  services in src/modules/<feature>/ — the only DB callers
  src/db/prisma.ts (Prisma 7 + @prisma/adapter-pg)
        │
        ▼
  PostgreSQL  (DATABASE_URL)

packages/ui  → Button + cn + Tailwind preset, consumed by dashboard
```

## API (`apps/api`)

- **NestJS 11 running directly on Bun** — no Nest CLI, no build step, no `dist/`.
  `bun --watch src/main.ts` executes TypeScript (with decorators) natively.
- `src/bootstrap.ts` builds the app: `NestFactory.create(AppModule)` + CORS
  (origins from `ALLOWED_API_ORIGINS`) + the tRPC express middleware mounted at
  `/trpc`. It is separate from `src/main.ts` so tests boot the identical composition.
- `src/app.controller.ts` is the only REST controller (`GET /health`).
- `src/modules/<feature>/` holds one folder per feature: `schema` (Zod) +
  `service` (all DB access, decorator-free, exports a plain class and a
  singleton), and a `controller` only when a non-tRPC consumer needs one.
- `src/db/prisma.ts` is the only Prisma client. It stays decorator-free because
  `src/trpc/` reaches it through the services; `src/db/prisma.module.ts` holds the
  Nest shutdown hook separately.
- `src/trpc/` is deliberately **framework-free** (no NestJS imports): `init.ts`
  creates the tRPC instance (superjson transformer, empty context,
  `publicProcedure` only), `routers/_app.ts` assembles `appRouter` and exports
  the types.

## Background jobs (Trigger.dev) and AI

- `apps/api/trigger.config.ts` — project ref, `runtime: "bun"`,
  `dirs: ["./src/trigger"]`. Tasks live in `src/trigger/`, one exported
  `task()` per file, and are bundled by the Trigger CLI, which runs under Node:
  `bun run --filter=@reclit/api trigger:dev` (loads `apps/api/.env`).
- `src/ai/` holds the model providers for the Vercel AI SDK (`gemini.ts`).
- Neither `src/trigger/` nor `@trigger.dev/sdk` may be imported from
  `src/trpc/**` or `src/modules/**` — that graph is transpiled by the
  dashboard. Tasks call services, never the other way round.
- Runs are recorded in the `RunAi` table
  ([docs/features/run-ai.md](docs/features/run-ai.md)).

## Type flow (why the dashboard gets full type safety)

`apps/api/package.json` exports `"./trpc/routers/_app"` pointing at the raw
TypeScript source. The dashboard imports `AppRouter` **as a type only** and Next
transpiles the import graph (`transpilePackages: ["@reclit/api"]`). That graph is
`_app.ts → <feature>.ts → init.ts → {@trpc/server, superjson, zod}` plus the
feature services and Prisma client — no NestJS — which is why the trpc directory
must stay free of decorator code.

Services declare **schema-inferred** return types and select explicit columns, so
`@prisma/client` types never reach `RouterOutputs`. The dashboard bundle contains
no Prisma code; `bunx turbo build` is the check.

## Dashboard (`apps/dashboard`)

- App Router with a single route: `/` (`src/app/(app)/page.tsx`), the dashboard.
  It is static — it calls no procedure. Chrome (sidebar + header) is mounted
  once by `src/app/(app)/layout.tsx` via `components/layout/app-shell.tsx` and
  fed by `src/config/nav.ts`. Light mode only: `providers.tsx` passes
  `forcedTheme="light"`.
- **i18n:** `next-intl` with no URL segment and no middleware. `src/i18n/request.ts`
  reads the `locale` cookie and loads `src/messages/<locale>.json`; every
  user-facing string is a key. Reading that cookie makes every route render
  dynamically.
- `/ai-spreadsheet` is the one data-bound page: it prefetches in the RSC and
  reads and writes `spreadsheet.*` from the client.
- `src/trpc/client.tsx` — browser client (`httpBatchStreamLink` →
  `NEXT_PUBLIC_API_URL`). `src/trpc/server.tsx` — RSC-side proxy with
  `prefetch`/`HydrateClient` helpers (uses `API_INTERNAL_URL` when set).
- No middleware/proxy file, no auth, no i18n layer.

## Environment

| Var | App | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | api | Postgres connection string, read by `prisma.config.ts` |
| `PORT` | api | listen port (dev script sets 4001) |
| `ALLOWED_API_ORIGINS` | api | CORS allowlist (default `http://localhost:4000`) |
| `TRIGGER_SECRET_KEY` | api | Trigger.dev environment key, read by the Trigger CLI / worker |
| `GOOGLE_GENERATIVE_AI_API_KEY` | api | Gemini key for the Vercel AI SDK (`src/ai/gemini.ts`) |
| `NEXT_PUBLIC_API_URL` | dashboard | browser tRPC target (default `http://localhost:4001`) |
| `API_INTERNAL_URL` | dashboard | optional SSR-side override |

Build-time pass-through vars live in `turbo.json`; add new ones there too.

## What is intentionally absent

No auth, no logger package, no Docker files, no i18n, no pagination, no CI
pipeline, and no REST beyond `GET /health`. Add them when a feature needs them.
