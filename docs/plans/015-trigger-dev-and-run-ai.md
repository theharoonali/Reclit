# 015 — Trigger.dev, Vercel AI SDK (Gemini), and the `run-ai` table

**Status:** implemented
**Scope:** backend

## Goal

The API can run background jobs on Trigger.dev and call Gemini through the
Vercel AI SDK, and a `RunAi` table exists to record one AI run per cell
(status, credit, result, batch). This is the substrate for executing AI
columns (`Column.node = AI`, plan 011), which still execute nothing. Ships with
one throwaway smoke task (`gemini-test`) that may be deleted later; the AI SDK
provider stays.

## Backend (Agent 1)

- **Trigger.dev:** installed in `apps/api` (`@trigger.dev/sdk`, dev
  `@trigger.dev/build`). `apps/api/trigger.config.ts` — project
  `proj_rjcebnrktkgcqviaukov`, `runtime: "bun"`, `dirs: ["./src/trigger"]`,
  `maxDuration: 300`. Script `trigger:dev` = `npx trigger.dev@latest dev`
  (the CLI runs under Node; tasks run on Bun). `.trigger` gitignored and
  excluded from Biome; `trigger.config.ts` added to the api tsconfig include.
- **AI SDK:** `apps/api/src/ai/gemini.ts` — `gemini(modelId?)` returns a
  Vercel AI SDK model from `@ai-sdk/google`, default `gemini-2.5-flash`,
  created lazily from `GOOGLE_GENERATIVE_AI_API_KEY`.
- **Task:** `apps/api/src/trigger/gemini-test.ts` — `gemini-test`, payload
  `{ prompt?: string }`, returns `{ text, usage }`. Imports nothing from
  `src/modules` or `src/trpc`.
- **Table `RunAi`:** `id uuid pk`, `cellId String` (indexed, plain string —
  the scoped Cell pk `"<sheetId>.cell.<r>.<c>"`), `batchId String` (indexed),
  `status RunAiStatus` (`PENDING | RUNNING | COMPLETED | FAILED`, default
  `PENDING`), `credit Int @default(0)`, `result Json?`, timestamps
  (`createdAt` indexed).
- **Procedures (reads only):**
  - `runAi.byId` (query, `{ id }`) → RunAi; NOT_FOUND, BAD_REQUEST.
  - `runAi.listByBatch` (query, `{ batchId }`) → RunAi[] (createdAt asc, `[]`
    for an unknown batch); BAD_REQUEST.
- **Service methods:** `runAiService.create({ cellId, batchId, credit? })`,
  `markRunning(id)`, `complete(id, { result, credit? })`,
  `fail(id, { result? })`, `byId(id)`, `listByBatch(batchId)`. Writes are
  service-only; in-process callers (spreadsheet service, a task) use them.
- Reused: `idInput` (common/schema), `isRecordNotFound` (common/prisma-errors),
  `mapDomainError`, the spreadsheet wire/db enum-case idiom, the lazy env
  client idiom from `file.service.ts`.
- Env: `TRIGGER_SECRET_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` in `apps/api/.env`
  (placeholders in `.env.example`, both in `turbo.json` `globalPassThroughEnv`).

## Frontend (Agent 2)

- None. No route or component changes.

## Integration (Agent 3)

- None. No page calls `runAi.*` yet.

## Decisions

- Trigger.dev lives in `apps/api`, not a `packages/tasks` workspace — tasks
  will call the api's services; a second package would need to re-import
  Prisma and the modules.
- `runtime: "bun"` to match the rest of the api (user's choice); the CLI
  itself still runs under Node, so the script uses `npx`, not `bunx`.
- `cellId` is a plain indexed string, not a foreign key: cleared cells are
  deleted rows and import wipes every cell, so a cascade would erase run
  history. Rejected `onDelete: SetNull` — a run must still say which cell it
  was for.
- `batchId` required (as specified); one run per cell, many per batch.
- `credit` is `Int @default(0)` (user's choice); Decimal rejected until
  fractional credits are a real requirement.
- Status is lowercase on the wire and uppercase in the database, mirroring
  `spreadsheet.schema.ts`, so `RouterOutputs` stays zod-owned and the
  dashboard keeps one enum vocabulary.
- Reads-only router (user's choice): writes happen in-process, so `create` /
  `updateStatus` mutations would be endpoints nobody calls.
- Model `RunAi`, table `"RunAi"`, no `@@map` — the repo has none.
- Gemini provider is lazy (like the Supabase client) rather than
  throw-at-import (like prisma.ts) so the api boots without the key.
- `gemini-2.5-flash` as the default model constant; change in one place.

## Risks / open questions

- `runtime: "bun"` on Windows with the current CLI is unverified; fallback is
  `runtime: "node"` (one line, task code is runtime-agnostic).
- A future task importing a service pulls Prisma into the Trigger bundle and
  needs `prismaExtension({ mode: "modern" })` from
  `@trigger.dev/build/extensions/prisma`. Out of scope here.
- `listByBatch` orders by `createdAt` (ms precision); ties between runs
  created in the same millisecond have no defined order.
- The Gemini key was pasted in chat; rotate it after setup.

---

## Outcome

- **Shipped:** everything above. `apps/api/trigger.config.ts`,
  `src/ai/gemini.ts`, `src/trigger/gemini-test.ts`; `RunAi` model + enum with
  migration `20260902013325_add_run_ai`; `modules/run-ai/*`
  (schema, errors, service), `trpc/routers/run-ai.ts` registered as `runAi`,
  `__tests__/run-ai.api.test.ts` (13 tests); `docs/features/run-ai.md` + index
  row; ARCHITECTURE.md and AGENTS.md updated; `trigger:dev` script;
  `.trigger` gitignored and Biome-excluded; env keys in `.env.example` and
  `turbo.json`.
- **Deviated:** `@trigger.dev/sdk` and `@trigger.dev/build` are pinned to the
  exact CLI version (`4.5.15`, no caret) — the Trigger CLI aborts on a
  caret-range mismatch. The CLI also labels `runtime: "bun"` experimental
  (OpenTelemetry instrumentation of third-party packages may not work);
  kept per the decision above, `runtime: "node"` remains the fallback.
- **Not done:** confirming `gemini-test` in the Trigger.dev dashboard — the
  CLI's logged-in account cannot see `proj_rjcebnrktkgcqviaukov`
  ("Project not found"), so `bun run trigger:dev` has to be re-run after
  logging in with the account that owns the project; `TRIGGER_SECRET_KEY` is
  not yet in `apps/api/.env` (only needed once the api triggers tasks).
  No task touches the database yet (needs the Prisma build extension).
- **Docs updated:** `docs/features/run-ai.md`, `docs/features/index.md`,
  `ARCHITECTURE.md`, `AGENTS.md`, contract header of `run-ai.api.test.ts`.
