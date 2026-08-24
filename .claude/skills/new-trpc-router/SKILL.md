---
name: new-trpc-router
description: Add a new tRPC router to the API and consume it from the dashboard. Use when the user asks to add an API endpoint, tRPC procedure, or new backend feature surface.
---

# Add a tRPC router (api → dashboard)

Full rules: [docs/rules/BACKEND.md](../../../docs/rules/BACKEND.md).
Rules that must hold (see AGENTS.md "Hard invariants"):
- Files under `apps/api/src/trpc/` must NOT import `@nestjs/*` or any decorated
  class — the dashboard transpiles this import graph.
- `_app.ts` must keep exporting `AppRouter`, `RouterInputs`, `RouterOutputs`.

## 1. Router file — `apps/api/src/trpc/routers/<name>.ts`

```ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../init";

export const <name>Router = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return [];
  }),

  create: publicProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return { ok: true };
    }),
});
```

Routers **validate and delegate only**. Anything touching the database goes in a
service under `apps/api/src/modules/<name>/` — copy `src/modules/note/`
(`schema` + `service`). Services stay decorator-free so this router can import
them.

`publicProcedure` is the only procedure type — there is no auth yet. The tRPC
context is empty (`apps/api/src/trpc/init.ts`); extend `createTRPCContext` there
if procedures need request data.

## 2. Register — `apps/api/src/trpc/routers/_app.ts`

```ts
import { <name>Router } from "./<name>";

export const appRouter = createTRPCRouter({
  // ...existing
  <name>: <name>Router,
});
```

## 3. Consume from the dashboard

Client component:

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const trpc = useTRPC();
const { data } = useQuery(trpc.<name>.list.queryOptions());
```

Server component (prefetch/SSR): use `trpc` + `prefetch`/`HydrateClient` from `@/trpc/server`.

## 4. REST instead?

The default is tRPC only (`GET /health` in `src/app.controller.ts` is the sole
REST endpoint). If a non-tRPC consumer needs REST, add `<name>.controller.ts` +
`<name>.module.ts` (a `@Module` binding the service singleton with `useValue`) to
the feature folder and import that module in `src/app.module.ts`. Never mix
controllers into `src/trpc/`. Import an injected service as a **value**, never
`import type`.

## 4b. Update the route doc

Add the new procedures to the "APIs called" table of every affected page in
[docs/routes/](../../../docs/routes/index.md), in this same change.

## 5. Verify

```bash
bunx turbo typecheck --filter=@reclit/api --filter=@reclit/dashboard
bunx turbo build          # confirms no server-only code leaked into the dashboard
curl "http://localhost:4001/trpc/<name>.list"
```
