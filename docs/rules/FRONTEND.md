# Frontend Rules

`apps/dashboard` — Next.js 16 App Router, Tailwind, shadcn-style `@reclit/ui`.
Shared rules: [COMMON.md](COMMON.md).

## Where code goes

| Path | Holds |
| --- | --- |
| `packages/ui/src/components/` | Shared primitives (currently just `button`). Add to the `exports` map in `packages/ui/package.json` |
| `apps/dashboard/src/components/` | Feature components (`notes-panel.tsx` is the example) |
| `apps/dashboard/src/app/<route>/page.tsx` | Route entry — layout and composition only |
| `apps/dashboard/src/trpc/` | Client/server tRPC wiring. Do not add feature logic here |

Pages stay thin: no data transformation, no business logic, no inline markup
beyond page framing.

## Reuse before you build

1. **Check `packages/ui` and existing feature components first.** If something
   with the same or nearly the same design exists, use it.
2. Nearly the same? Extend it with a prop. Do not fork or copy-paste a variant.
3. One component per job. No wrapper-of-a-wrapper. A form that serves both
   create and edit takes an optional record — it is not two components
   (the form inside `components/notes-panel.tsx` is the example).
4. A component used by two routes moves to `packages/ui` or a shared folder.

## Styling

- shadcn + Tailwind only.
- Use theme tokens: `bg-background`, `text-muted-foreground`, `border`,
  `text-destructive`. **No raw hex, no inline `style`, no arbitrary colors.**
- Tokens are CSS variables in `packages/ui/src/globals.css`, exposed through the
  Tailwind preset. Add a token there rather than a one-off color.
- `@reclit/ui` components are unanimated. Do not add enter/exit animation classes
  to Radix primitives — a stuck exit animation keeps the node mounted and
  swallows clicks.

## Data

- Client components: `useTRPC()` + `useQuery(trpc.x.y.queryOptions(input))`.
- Server components: `prefetch(trpc.x.y.queryOptions())` + `<HydrateClient>` from
  `@/trpc/server`.
- Mutations: `useMutation(trpc.x.y.mutationOptions({ onSuccess }))` and
  **invalidate the query they affect** — `queryClient.invalidateQueries({ queryKey: trpc.x.y.queryKey() })`.
- A page that reads live database data must set `export const dynamic = "force-dynamic"`,
  otherwise Next tries to prerender it at build time and the build fails.
- Always handle all three states: `isLoading`, `error`, and empty.

## Client boundaries

- `"use client"` only where interactivity actually requires it — keep it on the
  leaf component, not the page.
- Never import API runtime code; types only (see [COMMON.md](COMMON.md)).
