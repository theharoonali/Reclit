---
name: backend-feature
description: Build a backend feature in apps/api — Prisma model, zod schema, service, tRPC router (or REST controller), contract test, and feature doc. Use when the user asks to add an API endpoint, tRPC procedure, database table, service, or backend feature.
---

# Build a backend feature

Rules: [docs/rules/BACKEND.md](../../../docs/rules/BACKEND.md) ·
[TESTING.md](../../../docs/rules/TESTING.md) ·
[COMMON.md](../../../docs/rules/COMMON.md).
Follow the shape of the existing features in `apps/api/src/modules/`.

**First:** read the feature's doc in
[docs/features/](../../../docs/features/index.md) if it exists. If it does not,
this is a new feature — copy `docs/features/_template.md` at step 6.

Invariants that break the build if violated:
- Nothing under `apps/api/src/trpc/` or `src/modules/` may import `@nestjs/*`,
  `@trigger.dev/sdk` or a decorated class.
- Never `import type` a class NestJS constructor-injects.
- `_app.ts` keeps exporting `AppRouter`, `RouterInputs`, `RouterOutputs`.

## 1. Model — `apps/api/prisma/schema.prisma`

```prisma
model Thing {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([createdAt])
}
```

```bash
bun run --filter=@reclit/api db:migrate
```

Index every column a list query sorts or filters on. Never hand-edit an applied
migration.

## 2. Schema — `apps/api/src/modules/<feature>/<feature>.schema.ts`

```ts
import { z } from "zod";
import { idInput } from "../../common/schema";

export const thingSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const name = z.string().trim().min(1, "Name is required").max(200);

export const createThingInput = z.object({ name });

// Build update inputs from undefaulted fields — `createThingInput.partial()`
// keeps `.default()`s and silently blanks columns on a partial update.
export const updateThingInput = z.object({ name }).partial().extend(idInput.shape);

export type Thing = z.infer<typeof thingSchema>;
export type CreateThingInput = z.infer<typeof createThingInput>;
export type UpdateThingInput = z.infer<typeof updateThingInput>;
```

`idInput` and `paginationInput` come from `src/common/schema.ts`; put a fragment
there the moment a second feature needs it. Export a type only when something
imports it.

## 3. Errors — `apps/api/src/modules/<feature>/<feature>.errors.ts`

```ts
import { DomainError } from "../../common/errors";

export class ThingNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "THING_NOT_FOUND";
  constructor(id: string) {
    super(`Thing ${id} not found`);
    this.name = "ThingNotFoundError";
  }
}
```

`kind` picks the tRPC code / HTTP status (`not_found`, `bad_request`,
`conflict`, `unavailable`, `upstream`); `code` is what the client reads.

## 4. Service — `apps/api/src/modules/<feature>/<feature>.service.ts`

Plain class + singleton, no decorators, no `@nestjs/*`.

```ts
import type { Prisma } from "../../../generated/prisma/client";
import { isRecordNotFound } from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import { ThingNotFoundError } from "./thing.errors";
import type { CreateThingInput, Thing, UpdateThingInput } from "./thing.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1).

// One projection, used by every method — the API's shape is decided here.
const thingSelect = { id: true, name: true, createdAt: true, updatedAt: true } as const;
// Never hand-write a record type that mirrors the select.
type ThingRecord = Prisma.ThingGetPayload<{ select: typeof thingSelect }>;

export class ThingService {
  async list(): Promise<Thing[]> {
    return prisma.thing.findMany({ select: thingSelect, orderBy: { createdAt: "desc" } });
  }
  async byId(id: string): Promise<Thing> {
    const record = await prisma.thing.findUnique({ where: { id }, select: thingSelect });
    if (!record) throw new ThingNotFoundError(id);
    return record;
  }
  // create / update / remove — map Prisma P2025 to the domain error via
  // `isRecordNotFound`; JSON columns are written with `toJsonInput` (db/prisma.ts).
}

export const thingService = new ThingService();
```

Services own the database. One `select` per feature; one `byId` that throws,
called by every method that needs the row. When a service would pass ~250
lines, split by responsibility into `<feature>-<part>.service.ts` and have it
call the base service for lookups (see `spreadsheet-cells.service.ts`).

## 5. Router — `apps/api/src/trpc/routers/<feature>.ts`

```ts
import { idInput } from "../../common/schema";
import { createThingInput } from "../../modules/thing/thing.schema";
import { thingService } from "../../modules/thing/thing.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

export const thingRouter = createTRPCRouter({
  list: publicProcedure.query(() => thingService.list()),
  byId: publicProcedure
    .input(idInput)
    .query(({ input }) => thingService.byId(input.id).catch(mapDomainError)),
  create: publicProcedure
    .input(createThingInput)
    .mutation(({ input }) => thingService.create(input).catch(mapDomainError)),
});
```

Validate and delegate — nothing else. `.catch(mapDomainError)` on every call
that can throw a domain error; never a per-procedure `try/catch`. Register it:

```ts
// apps/api/src/trpc/routers/_app.ts
export const appRouter = createTRPCRouter({
  spreadsheet: spreadsheetRouter,
  thing: thingRouter,
});
```

`publicProcedure` is the only procedure type — there is no auth yet, and the
context is empty (`src/trpc/init.ts`).

**REST instead?** Only when a non-tRPC consumer needs it (multipart uploads,
a REST mirror). Add `<feature>.controller.ts` (imports the service singleton
directly, parses `{ ...body, ...params }` with the same zod schema) and
`<feature>.module.ts` (`@Module({ controllers: [ThingController] })`), then
import the module in `src/app.module.ts`. Domain and zod errors are mapped by
the global `DomainErrorFilter`. Never put a controller under `src/trpc/`.

**A background job?** The service exposes `setDispatcher`; the task goes in
`src/trigger/`, the `tasks.trigger` call in `src/jobs/<feature>-dispatch.ts`,
registered from `src/main.ts` — see BACKEND.md "Background jobs and AI".

## 6. Contract test — `apps/api/src/__tests__/<feature>.api.test.ts`

Mandatory, and it is the API documentation. Use the `api-testing` skill.
Helpers (`caller`, `expectError`, `expectTRPCError`, `startTestServer`) come
from `__tests__/support/`. The feature is not finished until every procedure
appears in its contract header with passing tests.

## 7. Docs

- `docs/features/<feature>.md` from `_template.md`, row added to
  `docs/features/index.md`. Behaviour = internal invariants; client-visible
  behaviour lives in the contract NOTES.
- The route doc of any page whose API table changed.
- The plan's `Outcome` section.

## 8. Verify

```bash
bunx turbo lint typecheck test --filter=@reclit/api
bunx turbo build          # confirms no server-only code leaked into the dashboard
```
