---
name: backend-feature
description: Build a backend feature in apps/api — Prisma model, zod schema, service, tRPC router (or REST controller), contract test, and feature doc. Use when the user asks to add an API endpoint, tRPC procedure, database table, service, or backend feature.
---

# Build a backend feature

Rules: [docs/rules/BACKEND.md](../../../docs/rules/BACKEND.md) ·
[TESTING.md](../../../docs/rules/TESTING.md) ·
[COMMON.md](../../../docs/rules/COMMON.md).
Reference implementation: `apps/api/src/modules/note/` — copy it.

**First:** read the feature's doc in
[docs/features/](../../../docs/features/index.md) if it exists. If it does not,
this is a new feature — copy `docs/features/_template.md` at step 6.

Invariants that break the build if violated:
- Nothing under `apps/api/src/trpc/` may import `@nestjs/*` or a decorated class.
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
export const updateThingInput = z
  .object({ name })
  .partial()
  .extend({ id: z.string().min(1) });

export const thingIdInput = z.object({ id: z.string().min(1) });

export type Thing = z.infer<typeof thingSchema>;
export type CreateThingInput = z.infer<typeof createThingInput>;
export type UpdateThingInput = z.infer<typeof updateThingInput>;
```

Reuse shared fragments from `src/common/schema.ts` (id, pagination) when they
exist; put a fragment there the moment a second feature needs it.

## 3. Service — `apps/api/src/modules/<feature>/<feature>.service.ts`

Plain class + singleton, no decorators, no `@nestjs/*`.

```ts
import { prisma } from "../../db/prisma";
import type { CreateThingInput, Thing, UpdateThingInput } from "./thing.schema";

export class ThingNotFoundError extends Error {
  constructor(id: string) {
    super(`Thing ${id} not found`);
    this.name = "ThingNotFoundError";
  }
}

// One projection, used by every method — the API's shape is decided here.
const thingSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class ThingService {
  async list(): Promise<Thing[]> {
    return prisma.thing.findMany({
      select: thingSelect,
      orderBy: { createdAt: "desc" },
    });
  }
  // create / byId / update / remove — see note.service.ts for the P2025 mapping
}

export const thingService = new ThingService();
```

Services own the database. One `select` const per feature; one private
"find or throw" helper rather than repeating the lookup in three methods.

## 4. Router — `apps/api/src/trpc/routers/<feature>.ts`

```ts
import { createThingInput, thingIdInput } from "../../modules/thing/thing.schema";
import { thingService } from "../../modules/thing/thing.service";
import { createTRPCRouter, publicProcedure } from "../init";

export const thingRouter = createTRPCRouter({
  list: publicProcedure.query(() => thingService.list()),
  create: publicProcedure
    .input(createThingInput)
    .mutation(({ input }) => thingService.create(input)),
});
```

Validate and delegate — nothing else. A router body over ~5 lines means logic
belongs in the service. Map domain errors to `TRPCError` the way
`routers/note.ts` does.

Register it:

```ts
// apps/api/src/trpc/routers/_app.ts
export const appRouter = createTRPCRouter({
  note: noteRouter,
  thing: thingRouter,
});
```

`publicProcedure` is the only procedure type — there is no auth yet, and the
context is empty (`src/trpc/init.ts`).

**REST instead?** The default is tRPC only (`GET /health` is the sole REST
route). If a non-tRPC consumer needs it, add `<feature>.controller.ts` +
`<feature>.module.ts` (a `@Module` binding the service singleton with `useValue`)
to the feature folder and import the module in `src/app.module.ts`. Never put a
controller under `src/trpc/`.

## 5. Contract test — `apps/api/src/__tests__/<feature>.api.test.ts`

Mandatory, and it is the API documentation. Use the `api-testing` skill; copy
`note.api.test.ts`. The feature is not finished until every procedure appears in
its contract header with passing tests.

## 6. Docs

- `docs/features/<feature>.md` from `_template.md`, row added to
  `docs/features/index.md`.
- The route doc of any page whose API table changed.
- The plan's `Outcome` section.

## 7. Verify

```bash
bunx turbo lint typecheck test --filter=@reclit/api
bunx turbo build          # confirms no server-only code leaked into the dashboard
```
