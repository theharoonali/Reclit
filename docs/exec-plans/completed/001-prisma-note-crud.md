# Plan 001 — Prisma + Postgres CRUD, and a rules/docs system for agents

> Status: **Done** — executed 2026-08-20. Moved here from `docs/exec-plans/active/`
> per [../../rules/COMMON.md](../../rules/COMMON.md).

## Context

`H:\Paper` is a Bun + Turborepo template (Next.js 16 dashboard + NestJS-on-Bun API,
bridged by tRPC). It deliberately ships one example of each pattern and **has no
database** — `packages/db` was removed and `docs/exec-plans/tech-debt-tracker.md`
logs "No database" as an intentional gap.

Two things are needed:

1. **A vertical slice that establishes the layering** — Postgres via Prisma, one
   table, a service layer, a NestJS controller, a tRPC router, and a working CRUD
   UI. This is scaffolding, not a feature: it exists so every future feature has an
   obvious shape to copy.
2. **A docs system that keeps agents out of the code.** Today an agent must read
   source to learn what a page does. The goal is that `docs/routes/<route>.md`
   tells it which files back a page, which APIs it calls, what's implemented and
   what isn't — so it only opens code when strictly necessary. Plus three short
   rule files (common / backend / frontend) that fix where things go and how types
   flow, and a plan-tracking convention (active → completed).

### Outcome of the database concern

Pre-flight probes suggested `db.yxszithzbcckyhsnjazh.supabase.co` was unreachable:
it resolves IPv6-only (`2a05:d018:a0:6001::`), `ping -6` timed out, and a .NET TCP
probe failed on address family. **Those probes were misleading** — ICMP is blocked
and the probe bound IPv4-only. `prisma migrate dev` connected on the first attempt
and the table was created. No pooler URL was needed.

The database password was pasted into a chat transcript and should be rotated.

### Decisions (confirmed)

| | |
| --- | --- |
| Prisma location | `apps/api/prisma` (not a shared package) |
| Table | `Note { id, title, content, createdAt, updatedAt }` |
| Route | `/dashboard` for the CRUD; `/` stays the landing page |
| UI additions | `input`, `label`, `table`, `dialog` in `@reclit/ui` |

---

## Step 0 — Register the plan (do this first)

Per the new plan rule, write this plan to `docs/exec-plans/active/001-prisma-note-crud.md`
**before** executing. On completion, move it to `docs/exec-plans/completed/` and
tick its checklist.

---

## Part A — Backend

### A1. Prisma setup

- `apps/api/prisma/schema.prisma`
  ```prisma
  generator client { provider = "prisma-client-js", output = "../generated/prisma" }
  datasource db    { provider = "postgresql", url = env("DATABASE_URL") }

  model Note {
    id        String   @id @default(uuid())
    title     String
    content   String   @default("")
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
  }
  ```
  Explicit `output` keeps this working across Prisma 6 and 7.
- `apps/api/package.json`: add `prisma` (dev) + `@prisma/client` deps; scripts
  `db:generate`, `db:migrate`, `db:deploy`, `db:studio`; `postinstall: prisma generate`.
- `.gitignore`: add `apps/api/generated/`.
- `turbo.json`: add `DATABASE_URL` to `globalPassThroughEnv`; add a `db:generate`
  task and make `typecheck`/`build`/`test` in the api depend on it.
- `.github/workflows/ci.yml`: run `prisma generate` before typecheck.

### A2. Client singleton — `apps/api/src/db/prisma.ts`

Framework-free (no `@nestjs/*`). Exports `prisma` (singleton, guarded against
`bun --watch` re-instantiation) and `disconnectPrisma()`. `bootstrap.ts` calls
`app.enableShutdownHooks()` and disconnects on close.

### A3. Feature module — `apps/api/src/modules/note/`

Four files, and this is the shape every future feature copies:

| File | Contains | May import NestJS? |
| --- | --- | --- |
| `note.schema.ts` | Zod schemas: `noteSchema`, `createNoteInput`, `updateNoteInput`, `noteIdInput` + inferred types | no |
| `note.service.ts` | `class NoteService` — `list/get/create/update/remove` over `prisma`; exports singleton `noteService` | no |
| `note.controller.ts` | `@Controller("notes")` REST wrapper delegating to `NoteService` | yes |
| `note.module.ts` | `@Module` — `providers: [{ provide: NoteService, useValue: noteService }]`, `controllers: [NoteController]` | yes |

**Critical constraint** (AGENTS.md invariant 2): the service must stay
decorator-free so `src/trpc/` can import it. DI still works because the module
binds the class token to the pre-built singleton via `useValue`. The controller
imports `NoteService` as a **value**, not `import type` (invariant 4).

**Boundary rule:** `NoteService` methods return objects shaped by
`noteSchema` — never raw Prisma model types. This keeps `@prisma/client` types out
of `RouterOutputs`, so the dashboard never has to resolve them. This is a rule, not
just a detail (see C1).

Register `NoteModule` in `apps/api/src/app.module.ts`.

### A4. tRPC router — `apps/api/src/trpc/routers/note.ts`

`list` / `byId` query, `create` / `update` / `remove` mutation. Inputs from
`note.schema.ts`, bodies delegate to `noteService`. Not-found → `TRPCError({ code: "NOT_FOUND" })`.
Register as `note:` in `apps/api/src/trpc/routers/_app.ts`.

### A5. Health + env

- `apps/api/src/app.controller.ts`: `/health` runs `SELECT 1` and reports
  `{ status, db: "ok" | "down" }`, 503 when down. Update `docs/RELIABILITY.md`
  (it currently states there are no dependency probes).
- `apps/api/.env.example` / `.env`: reduce to `PORT`, `ALLOWED_API_ORIGINS`,
  `DATABASE_URL`. Both currently list stale vars for deleted packages
  (`SUPABASE_SECRET_KEY`, `APP_ENCRYPTION_KEY`, `DATABASE_REPLICA_URL`,
  `INTERNAL_API_KEY`). Set the real `DATABASE_URL` in `.env` (gitignored),
  placeholder in `.env.example`.
- `apps/dashboard/.env` similarly drops its stale Supabase vars.

---

## Part B — Frontend

### B1. `@reclit/ui` additions

Add `input.tsx`, `label.tsx`, `table.tsx`, `dialog.tsx` in
`packages/ui/src/components/` (standard shadcn source, using the existing
`cn` from `packages/ui/src/utils/cn.ts` and the existing CSS-variable tokens in
`packages/ui/src/globals.css`). Register each in the `exports` map of
`packages/ui/package.json` — subpath-per-component, matching `./button`,
`./card`, `./skeleton`. New deps: `@radix-ui/react-dialog`, `@radix-ui/react-label`.

### B2. Route + components

| File | Kind | Role |
| --- | --- | --- |
| `apps/dashboard/src/app/dashboard/page.tsx` | RSC | `prefetch(trpc.note.list.queryOptions())` + `HydrateClient` (helpers already exist in `src/trpc/server.tsx`), renders `<NotesPanel />` |
| `apps/dashboard/src/components/notes/notes-panel.tsx` | client | `useQuery(trpc.note.list…)`, `Table` of notes, "New note" button, per-row edit/delete; `Skeleton` while loading, mutations invalidate the list query |
| `apps/dashboard/src/components/notes/note-form-dialog.tsx` | client | **One** dialog used for both create and edit — passed an optional `note`; create when absent, update when present |

Deliberately no separate delete component and no `react-hook-form` — per the
reusability / no-extra-complexity rule, delete is a button in the row and
validation reuses the Zod schema types already inferred from the API.

`/` is untouched apart from a link to `/dashboard`.

---

## Part C — Docs (the main deliverable)

### C1. Three rule files — `docs/rules/`

Short and prescriptive. No prose beyond what's needed.

**`docs/rules/COMMON.md`**
- Plan lifecycle: a plan that is written but not executed goes in
  `docs/exec-plans/active/`; once executed it moves to
  `docs/exec-plans/completed/`. Never delete a plan.
- Types: **Zod schemas in `<feature>.schema.ts` are the single source of truth.**
  Backend infers with `z.infer`. Frontend takes types from `RouterInputs` /
  `RouterOutputs` (`@reclit/api/trpc/routers/_app`) — never re-declare a shape the
  API already describes.
- Prisma model types never cross the tRPC boundary; services return
  schema-shaped objects.
- Every new route gets a `docs/routes/<route>.md`; every change to a route's
  files or APIs updates that doc in the same change.
- The dashboard imports API code **type-only**, never at runtime.

**`docs/rules/BACKEND.md`**
- One folder per feature: `apps/api/src/modules/<feature>/` with
  `<feature>.{schema,service,controller,module}.ts`. Table of what belongs in each.
- `src/trpc/**` is framework-free — no `@nestjs/*`, no decorated classes.
  Routers hold validation + delegation only; all DB access lives in the service.
- DB access only through `src/db/prisma.ts`. Schema changes always via
  `prisma migrate dev` — never hand-edit the DB or an applied migration.
- Errors: `TRPCError` in routers, Nest `HttpException` in controllers; services
  throw plain typed errors.
- Never `import type` a class NestJS constructor-injects.

**`docs/rules/FRONTEND.md`**
- Shared primitives → `packages/ui/src/components/` (shadcn source, registered in
  the `exports` map). Route-specific components → `apps/dashboard/src/components/<feature>/`.
  Pages stay thin: layout + composition only.
- **Check `packages/ui` and existing components before creating one.** If a
  component with the same or nearly the same design exists, extend it with a prop
  rather than forking it. One component per job — no wrapper-of-a-wrapper.
- shadcn + Tailwind only. Use theme tokens (`bg-background`, `text-muted-foreground`);
  no raw hex, no inline styles.
- Data: client components `useTRPC()` + `useQuery(...queryOptions())`; server
  components `prefetch` + `HydrateClient`. Mutations invalidate the query they affect.
- `"use client"` only where interactivity actually requires it.

### C2. Route docs — `docs/routes/`

The point: an agent reads one file and knows the whole slice without opening code.

- `docs/routes/_template.md` — fixed section order, copied for every new route.
- `docs/routes/index.md` — table of route → doc → one-line purpose.
- `docs/routes/root.md` — `/`
- `docs/routes/dashboard.md` — `/dashboard`

Each route doc carries:

1. **Purpose** — one line.
2. **Frontend files** — table: path · kind (RSC/client) · responsibility.
3. **Backend files** — table: path · layer (schema/service/controller/router).
4. **APIs called** — table: procedure · type · input · output · service method · table.
   For `/dashboard`: `note.list`, `note.byId`, `note.create`, `note.update`, `note.remove`.
5. **Implemented / Not implemented** — explicit checklist, so an agent knows what
   already exists before writing anything.
6. **Reusable pieces** — which components/services to extend rather than duplicate.
7. **Linked routes** — pointers to other route docs instead of restating them.

### C3. Wire the docs together

- `AGENTS.md`: add `docs/rules/*` and `docs/routes/index.md` to "Deeper docs", plus
  a line up top — *read the route doc before touching a page; open code only if the
  doc is insufficient.* Add the module layout to the conventions table.
- `docs/PLANS.md`: replace "No plan documents exist yet" with **Active** / **Done**
  sections and the lifecycle rule.
- `ARCHITECTURE.md`: add Postgres/Prisma to the diagram and env table; drop
  "no database" from "What is intentionally absent".
- `docs/exec-plans/tech-debt-tracker.md`: remove the "No database" row.
- `docs/generated/db-schema.md`: document the `Note` table.
- `docs/FRONTEND.md`: add the `/dashboard` route to the structure block and link
  to `docs/rules/FRONTEND.md`.
- `README.md`: DB setup step + `docs/rules` / `docs/routes` in the docs list.
- `.claude/skills/new-trpc-router/SKILL.md`: point at `docs/rules/BACKEND.md` and
  add the "also update the route doc" step.

---

## Verification

```bash
bun install
bun run --filter=@reclit/api db:generate
bun run --filter=@reclit/api db:migrate    # expected to fail on the IPv6 issue — report verbatim
bunx turbo lint typecheck
bunx turbo build                          # confirms the type-only API import still erases cleanly
bunx turbo test
bun dev                                   # → http://localhost:3001/dashboard
```

- **Build is the real check on the type bridge.** If `bunx turbo build` ever pulls
  `@prisma/client` into the dashboard, the DTO boundary in A3 has been violated —
  fix the service return types, don't loosen the build config.
- `apps/api/src/__tests__/` gains a note-CRUD test using the existing
  `createCallerFactory` pattern from `smoke.test.ts`. It must **skip** (not fail)
  when the DB is unreachable, so CI and the current machine stay green.
- Manual: create → row appears; edit → row updates; delete → row disappears;
  reload → data persists. `curl localhost:3003/health` reports `db: "ok"`.
- Docs check: read only `docs/routes/dashboard.md` and confirm it names every file
  and procedure in the slice. If something is missing, the doc is wrong.

## Done criteria

- [x] `Note` table migrated (`20260820004848_init_note`) against Supabase
- [x] CRUD works end to end at `/dashboard` (verified in a real browser)
- [x] `docs/rules/{COMMON,BACKEND,FRONTEND}.md` exist and are short
- [x] `docs/routes/{_template,index,root,dashboard}.md` exist
- [x] Plan moved from `active/` to `completed/`

---

## What actually happened (deviations from the plan)

Recorded so the next agent does not rediscover these.

1. **Prisma 7, not 6.** The `prisma-client` generator replaces `prisma-client-js`,
   `output` is mandatory, the datasource URL moves from `schema.prisma` to
   `prisma.config.ts`, and a **driver adapter is required** — hence
   `@prisma/adapter-pg`. `prisma.config.ts` needs `import "dotenv/config"`; the
   Prisma CLI does not load `.env` on its own.
2. **Biome broke Nest DI.** Its `style/useImportType` rule rewrote
   `import { NoteService }` into `import type { NoteService }` in the controller,
   erasing `design:paramtypes` and making DI fail at boot with
   `UnknownDependenciesException`. Fixed by disabling that rule for `apps/api/**`
   in `biome.json` — a code comment is not enough to stop a linter.
3. **`createNoteInput.partial()` blanked `content`.** Zod keeps a field's
   `.default("")` through `.partial()`, so a title-only update wrote an empty
   string. Update schemas are now built from undefaulted fields. Caught by a test.
4. **Dialog animations broke the page.** `data-[state=closed]:animate-out` left
   the overlay permanently mounted with a never-finishing `exit` animation,
   swallowing every subsequent click. Animations removed; `@reclit/ui` is unanimated.
5. **`/dashboard` had to be `force-dynamic`.** Next tried to prerender it at build
   time, when no API is running, and the build failed.
6. **`expect(p).rejects.toThrow(/regex/)` hangs** against `TRPCError` rejections in
   bun 1.3.9. Tests assert on `TRPCError.code` in a try/catch instead.
7. **Added beyond the plan:** `@reclit/ui/textarea` (note content needs a multiline
   field) and `src/common/zod-validation.pipe.ts` (REST body validation).
