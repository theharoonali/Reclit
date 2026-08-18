---
name: new-trpc-router
description: Add a new tRPC router to the API and consume it from the dashboard. Use when the user asks to add an API endpoint, tRPC procedure, or new backend feature surface.
---

# Add a tRPC router (api → dashboard)

## 1. Router file — `apps/api/src/trpc/routers/<name>.ts`

```ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init";

export const <name>Router = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    // ctx.db (Drizzle), ctx.session (null unless authed), ctx.supabase
    return [];
  }),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // ctx.session is guaranteed here
      return { ok: true };
    }),
});
```

Procedure types (from `apps/api/src/trpc/init.ts`):
- `publicProcedure` — no auth
- `protectedProcedure` — requires a valid Supabase JWT (`ctx.session` non-null)
- `internalProcedure` — service-to-service only via `x-internal-key`

## 2. Register — `apps/api/src/trpc/routers/_app.ts`

```ts
import { <name>Router } from "./<name>";

export const appRouter = createTRPCRouter({
  // ...existing
  <name>: <name>Router,
});
```

Do NOT remove the `AppRouter`, `RouterInputs`, `RouterOutputs` exports — the dashboard
depends on them via `@repo/api/trpc/routers/_app`.

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

## 4. Database access

Use `ctx.db` with schema from `@repo/db/schema`. If a new table is needed:
edit `packages/db/src/schema.ts`, then from `packages/db` run `bunx drizzle-kit generate`.

## 5. Verify

```bash
bunx turbo typecheck --filter=@repo/api --filter=@repo/dashboard
curl "http://localhost:3003/trpc/<name>.list"
```
