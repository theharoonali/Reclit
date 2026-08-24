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
  │             └── appRouter → note.{list,byId,create,update,remove}
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
  singleton). `src/modules/note/` is the reference implementation.
- `src/db/prisma.ts` is the only Prisma client. It stays decorator-free because
  `src/trpc/` reaches it through the services; `src/db/prisma.module.ts` holds the
  Nest shutdown hook separately.
- `src/trpc/` is deliberately **framework-free** (no NestJS imports): `init.ts`
  creates the tRPC instance (superjson transformer, empty context,
  `publicProcedure` only), `routers/_app.ts` assembles `appRouter` and exports
  the types.

## Type flow (why the dashboard gets full type safety)

`apps/api/package.json` exports `"./trpc/routers/_app"` pointing at the raw
TypeScript source. The dashboard imports `AppRouter` **as a type only** and Next
transpiles the import graph (`transpilePackages: ["@reclit/api"]`). That graph is
`_app.ts → note.ts → init.ts → {@trpc/server, superjson, zod}` plus the note
service and Prisma client — no NestJS — which is why the trpc directory must
stay free of decorator code.

Services declare **schema-inferred** return types and select explicit columns, so
`@prisma/client` types never reach `RouterOutputs`. The dashboard bundle contains
no Prisma code; `bunx turbo build` is the check.

## Dashboard (`apps/dashboard`)

- App Router with a single route: `/` (`src/app/page.tsx`) server-prefetches
  `note.list` and renders the notes CRUD from `src/components/notes-panel.tsx`.
  It is `force-dynamic` because it reads live database rows.
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
| `NEXT_PUBLIC_API_URL` | dashboard | browser tRPC target (default `http://localhost:4001`) |
| `API_INTERNAL_URL` | dashboard | optional SSR-side override |

Build-time pass-through vars live in `turbo.json`; add new ones there too.

## What is intentionally absent

No auth, no logger package, no Docker files, no i18n, no pagination, no CI
pipeline, and no REST beyond `GET /health`. Add them when a feature needs them.
