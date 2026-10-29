# Architecture

## Overview

Two apps, one shared package, one type bridge, one database.

```
apps/dashboard (Next.js 16, port 4000)
  │  imports type AppRouter from "@reclit/api/trpc/routers/_app"   ← types only
  │
  │  HTTP: httpBatchStreamLink → http://localhost:4001/trpc
  │  SSE:  httpSubscriptionLink → the same URL, for subscriptions
  ▼
apps/api (NestJS on Bun, port 4001)
  ├── /trpc/*         tRPC 11 express adapter, mounted in src/bootstrap.ts
  │                   appRouter → spreadsheet.*, workspace.*, user.*, runAi.*
  │                   (+ onChange over SSE), externalApi.*, populate.*, dashboard.*,
  │                   assistant.* (+ onChange over SSE)
  ├── /health         AppController (database reachability)
  ├── /spreadsheets/* SpreadsheetController (REST mirror + multipart import)
  ├── /populate/*     PopulateController (the Populate API: fields + submit a row)
  ├── /assistant/transcribe  AssistantController (the capsule's mic → ElevenLabs → text)
  └── /files          FileController (multipart upload → Supabase Storage, delete)
        │
        ▼  services in src/modules/<feature>/ — the only DB callers
  src/db/prisma.ts (Prisma 7 + @prisma/adapter-pg)
        │                       ▲ LISTEN run_ai_changed / assistant_run_changed
        ▼                       │ (src/common/live-feed.ts, one pg connection per channel per process)
  PostgreSQL  (DATABASE_URL)  ──┘ triggers run_ai_notify on "RunAi", assistant_run_notify on "AssistantRun"
        ▲
        │  runAiBatchService.runCells → dispatcher hook → src/jobs/run-ai-dispatch.ts → tasks.trigger
        │  assistantControlService.start/cancel/respond → src/jobs/assistant-dispatch.ts → trigger / runs.cancel / wait.completeToken
        │
  Trigger.dev worker (src/trigger/, bundled by the Trigger CLI)
        ├── run-ai-batch: per runnable column (a wave) prepares the inputs, then batchTriggerAndWait →
        ├── run-ai-cell: calls the same services → the row's audio through ElevenLabs,
        │                its url cells through crawl-website (both cached in ExternalApi)
        │                → Gemini via src/ai/ (grounded with the google_search tool for a
        │                google_search column; drafting an email for an email column,
        │                then sending it through Resend) → writes the run + cell
        ├── crawl-website: one site through Firecrawl → ExternalApi, reused from any cell
        └── assistant-run: the header capsule's prompt as a Gemini tool loop over the
                           spreadsheet + dashboard services, one tool call at a time; a
                           delete suspends on a waitpoint token until the user confirms

packages/ui               → shared primitives + Tailwind preset, consumed by the dashboard
packages/dashboard-engine → the dashboard's formula + query engine (pure TS): the api
                            validates widget queries with it on write, the dashboard
                            computes every widget with it in the browser
```

## API (`apps/api`)

- **NestJS 11 running directly on Bun** — no Nest CLI, no build step, no `dist/`.
  `bun --watch src/main.ts` executes TypeScript (with decorators) natively.
- `src/bootstrap.ts` builds the app: `NestFactory.create(AppModule)` + CORS
  (origins from `ALLOWED_API_ORIGINS`) + the global `DomainErrorFilter` + the
  tRPC express middleware at `/trpc`. Tests boot this; `src/main.ts` adds what
  only the running server needs (the Trigger.dev dispatcher, shutdown hooks,
  `listen`).
- `src/modules/<feature>/` holds one folder per feature. Layout, layers and
  the no-repetition table: [docs/rules/BACKEND.md](docs/rules/BACKEND.md).
  What each feature does: [docs/features/](docs/features/index.md).
- `src/db/prisma.ts` is the only Prisma client, framework-free because
  `src/trpc/` reaches it through the services; `src/db/prisma.module.ts` holds
  the Nest shutdown hook separately.
- `src/trpc/` is **framework-free** (no NestJS imports): `init.ts` creates the
  tRPC instance (superjson, empty context, `publicProcedure` only, `sse`
  options, `mapDomainError`), `routers/_app.ts` assembles `appRouter` and
  exports the types.

## Background jobs (Trigger.dev) and AI

- `apps/api/trigger.config.ts` — project ref, `runtime: "bun"`,
  `dirs: ["./src/trigger"]`, `prismaExtension({ mode: "modern" })` (tasks
  import the services, so the Prisma client rides along). The CLI runs under
  Node: `bun run --filter=@reclit/api trigger:dev` (loads `apps/api/.env`).
- Tasks (`src/trigger/`) call services; services never import the SDK. The
  API enqueues through a hook a service exposes (`setDispatcher`) that
  `src/jobs/<feature>-dispatch.ts` registers from `src/main.ts` — not from
  `bootstrap.ts`, so the test suite stays network-free.
- `src/ai/` holds the model providers (`gemini.ts` for the Vercel AI SDK,
  `elevenlabs.ts` for Speech-to-Text, `firecrawl.ts` for crawling, `resend.ts`
  for sending a mail cell's email) and the
  helpers a task composes: the prompt (`cell-prompt.ts`), the row's
  attachments (`cell-attachments.ts`), its audio transcripts
  (`cell-transcripts.ts`) and its crawled websites (`cell-crawls.ts`), the
  last two cached in `ExternalApi` —
  [docs/features/external-api.md](docs/features/external-api.md).
- The jobs today are `run-ai-batch` (the orchestrator of one Run click: one
  wave per AI column, prepared then fanned out), `run-ai-cell` (one cell),
  `crawl-website` (one site through Firecrawl into the store — general, one
  at a time, triggered by `run-ai-cell` for every url cell of a row) — their
  lifecycle, table and stream are
  [docs/features/run-ai.md](docs/features/run-ai.md) — and `assistant-run`
  (one prompt from the header capsule: a step-by-step `generateText` loop
  whose tools are executed by the task through the services, with a
  waitpoint token before every delete and a cancel the api can send) —
  [docs/features/assistant.md](docs/features/assistant.md). The assistant's
  prompt (`assistant-prompt.ts`) and its one model call (`assistant-step.ts`)
  live in `src/ai/` too.

## Live updates (tRPC subscriptions over SSE)

- `src/trpc/init.ts` sets the `sse` options (ping every 15 s; a client that
  hears nothing for 45 s reconnects with its last event id). Subscriptions
  are async generators that `yield tracked(id, data)`; tRPC injects
  `lastEventId` into the input on reconnect.
- The signal comes from the database: a trigger `NOTIFY`s row ids, one
  `pg` `LISTEN` connection per channel per API process (a `LiveFeed` from
  `src/common/live-feed.ts`, instantiated in `<feature>.feed.ts`) receives
  them, and a `<feature>-changes.service.ts` resolves ids into rows once per
  process and yields per-scope events. A row written by the Trigger.dev
  worker, another replica or psql reaches the sheet the same way as one
  written by the api itself.
- The dashboard's `src/trpc/client.tsx` routes `op.type === "subscription"`
  to `httpSubscriptionLink` (the browser's `EventSource`) and everything else
  to `httpBatchStreamLink`. Consume with
  `useSubscription(trpc.<name>.<proc>.subscriptionOptions(input, { onData }))`.
- Two streams exist: `runAi.onChange` (one sheet's working runs) and
  `assistant.onChange` (one workspace's assistant run); either feed + changes
  pair is the pattern for the next live table.

## Type flow (why the dashboard gets full type safety)

`apps/api/package.json` exports `"./trpc/routers/_app"` pointing at the raw
TypeScript source. The dashboard imports `AppRouter` **as a type only** and Next
transpiles the import graph (`transpilePackages: ["@reclit/api"]`). That graph is
`_app.ts → <feature>.ts → init.ts → {@trpc/server, superjson, zod}` plus the
feature services, the feed, the Prisma client and `@reclit/dashboard-engine`
(also in `transpilePackages`) — no NestJS, no `@trigger.dev/sdk` — which is
why those directories must stay free of both.

Services declare **schema-inferred** return types and select explicit columns, so
`@prisma/client` types never reach `RouterOutputs`. The dashboard bundle contains
no Prisma code; `bunx turbo build` is the check.

## Dashboard (`apps/dashboard`)

- App Router. Chrome (sidebar + header) is mounted once by
  `src/app/(app)/layout.tsx` via `components/layout/app-shell.tsx` and fed by
  `src/config/nav.ts`. Light mode only: `providers.tsx` passes
  `forcedTheme="light"`. One doc per page: [docs/routes/](docs/routes/index.md).
- **i18n:** `next-intl` with no URL segment and no middleware. `src/i18n/request.ts`
  reads the `locale` cookie and loads `src/messages/<locale>.json`; every
  user-facing string is a key. Reading that cookie makes every route render
  dynamically.
- `src/trpc/client.tsx` — browser client (`httpBatchStreamLink` +
  `httpSubscriptionLink` → `NEXT_PUBLIC_API_URL`). `src/trpc/server.tsx` —
  RSC-side proxy with `prefetch`/`HydrateClient` helpers (uses
  `API_INTERNAL_URL` when set).
- No middleware/proxy file, no auth. Routing on user state is client-side:
  `components/onboarding/onboarding-gate.tsx` wraps the `(app)` and
  `(onboarding)` route groups, shows a full-screen loader while `user.me`
  resolves, and redirects on `onboardingCompleted`
  ([docs/routes/onboarding.md](docs/routes/onboarding.md)).

## Environment

| Var | App | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | api, worker | Postgres connection string, read by `prisma.config.ts`, `db/prisma.ts` and the run-ai feed |
| `PORT` | api | listen port (dev script sets 4001) |
| `ALLOWED_API_ORIGINS` | api | CORS allowlist (default `http://localhost:4000`) |
| `SUPABASE_URL`, `SUPABASE_KEY` | api | Supabase Storage for `POST /files`; unset → 503 on upload |
| `TRIGGER_SECRET_KEY` | api | Trigger.dev environment key the api enqueues with (`src/jobs/run-ai-dispatch.ts`); the Trigger CLI reads it too |
| `GOOGLE_GENERATIVE_AI_API_KEY` | api, worker | Gemini key for the Vercel AI SDK (`src/ai/gemini.ts`), including the `google_search` node's grounding; the local worker reads `apps/api/.env`, a deployed one its Trigger environment; the api answers `assistant.recommendWidgets` with it (without it the procedure is SERVICE_UNAVAILABLE) |
| `ELEVENLABS_API_KEY` | api, worker | ElevenLabs Speech-to-Text (`src/ai/elevenlabs.ts`): the worker transcribes audio cells (without it the prompt says the audio could not be transcribed); the api transcribes the header capsule's mic recording through `POST /assistant/transcribe` (without it the route answers 503) |
| `ASSISTANT_MODEL` | api, worker | optional; the Gemini model the assistant's tool loop (worker) and its recommendation call (api) use (`src/ai/assistant-step.ts`), default `gemini-2.5-flash` |
| `FIRECRAWL_API_KEY` | worker | Firecrawl for url cells (`src/ai/firecrawl.ts`, the `crawl-website` task); same two places; without it the prompt says the site could not be crawled |
| `RESEND_API_KEY`, `RESEND_FROM` | worker | Resend for mail (`email`) cells (`src/ai/resend.ts`); `RESEND_FROM` is optional, default `Reclit <noreply@reclit.com>`; same two places; without the key a mail cell fails with the reason |
| `NEXT_PUBLIC_API_URL` | dashboard | browser tRPC target (default `http://localhost:4001`) |
| `API_INTERNAL_URL` | dashboard | optional SSR-side override |

Build-time pass-through vars live in `turbo.json`; add new ones there too.

## What is intentionally absent

No auth, no logger package, no Docker files, no CI pipeline, and no REST
beyond `GET /health`, the spreadsheet mirror, the Populate API and `/files`. Add them when a
feature needs them.
