---
name: frontend-feature
description: Build dashboard UI — pages, feature components, shared shadcn primitives, app chrome (sidebar/header/footer), and Tailwind tokens. Use when the user asks to add a screen, component, layout, navigation entry, or styling change in apps/dashboard.
---

# Build frontend UI

Rules: [docs/rules/FRONTEND.md](../../../docs/rules/FRONTEND.md) ·
[COMMON.md](../../../docs/rules/COMMON.md).
Reference: `apps/dashboard/src/components/notes-panel.tsx` (one form serving
create *and* edit).

**Need an API shape?** Read only the contract header of
`apps/api/src/__tests__/<feature>.api.test.ts`. Never read backend source.

## 0. Reuse check — before writing anything

```bash
ls packages/ui/src/components apps/dashboard/src/components
grep -rn "<what you are about to build>" apps/dashboard/src packages/ui/src
```

Take the first rung that applies: it exists → import it · it nearly exists → add
a prop or `cva` variant · used by two features → move to `components/common/` ·
used by two apps → move to `packages/ui`. **Never fork a component.**

## 1. Where the file goes

| Building | Path |
| --- | --- |
| shadcn/generic primitive | `packages/ui/src/components/<name>.tsx` + `exports` entry in `packages/ui/package.json` |
| cross-feature piece (`page-header`, `empty-state`, `data-table`, `confirm-dialog`) | `apps/dashboard/src/components/common/<name>.tsx` |
| feature UI | `apps/dashboard/src/components/<feature>/<name>.tsx` |
| chrome | `apps/dashboard/src/components/layout/app-{shell,sidebar,header,footer}.tsx` |
| nav/menu/footer data | `apps/dashboard/src/config/nav.ts` |
| page | `apps/dashboard/src/app/(app)/<route>/page.tsx` |

## 2. Component shape

```tsx
"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";

type ThingListProps = {
  items: Thing[];
  isLoading?: boolean;
  error?: string | null;
  onEdit: (thing: Thing) => void;
  onDelete: (id: string) => void;
};

export function ThingList({ items, isLoading, error, onEdit }: ThingListProps) {
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-destructive">{error}</p>;
  if (items.length === 0) return <p className="text-muted-foreground">No things yet.</p>;
  return <ul className="divide-y divide-border">{/* … */}</ul>;
}
```

- Props in, callbacks out. A presentational component does not fetch.
- Under ~150 lines. Over that, split the container (`<feature>-panel.tsx`) from
  the views (`<feature>-list.tsx`, `<feature>-form.tsx`).
- One component per job. A create/edit form takes an optional record — it is not
  two components.
- Always render loading, error, and empty states.

## 3. Pages stay thin

```tsx
export const dynamic = "force-dynamic"; // any page reading live DB data

export default function Page() {
  prefetch(trpc.thing.list.queryOptions());
  return (
    <HydrateClient>
      <ThingPanel />
    </HydrateClient>
  );
}
```

Framing and composition only — no transformation, no business logic, no chrome.
The sidebar/header/footer come from `app/(app)/layout.tsx` via `<AppShell>`.

## 4. Adding a screen to the chrome

Add an entry to `src/config/nav.ts` and create the page. **Do not edit
`app-sidebar.tsx`** — it renders that config and derives the active item from
`usePathname()`.

## 5. Styling

- Tailwind only. Semantic tokens only: `bg-background`, `text-muted-foreground`,
  `border`, `bg-card`, `text-destructive`. `bg-white` / `text-gray-500` /
  `bg-[#0af]` / inline `style` are all bugs.
- New colour → add the token to **both** `:root` and `.dark` in
  `packages/ui/src/globals.css`, then use it. Radius → `--radius` in the same
  file. Fonts, animations, spacing → `packages/ui/tailwind.config.ts`
  (`theme.extend`). Never in the dashboard config or a component.
- Compose classes with `cn()`, never string concatenation. Mobile-first.

## 6. Adding a shadcn component

1. Put the source in `packages/ui/src/components/<name>.tsx`.
2. Import `cn` from `@reclit/ui/cn`.
3. **Strip enter/exit animation classes** — a stuck exit animation keeps a Radix
   node mounted and swallows clicks. `@reclit/ui` is unanimated by design.
4. Add its Radix dependency to `packages/ui/package.json` (not the dashboard).
5. Register `"./<name>": "./src/components/<name>.tsx"` in the `exports` map.

## 7. Data (integration only)

Building the UI first? Render from a local fixture typed to the contract, expose
`on*` callbacks, and let the integration step wire it —
[WORKFLOW.md](../../../docs/rules/WORKFLOW.md).

When wiring: `useTRPC()` + `useQuery(trpc.x.y.queryOptions(input))`,
`useMutation(trpc.x.y.mutationOptions({ onSuccess }))`, and **invalidate the
affected query** with `queryClient.invalidateQueries({ queryKey: trpc.x.y.queryKey() })`.
Types come from `RouterInputs`/`RouterOutputs` — never hand-write an API shape.

## 8. Docs + verify

Update the route doc in [docs/routes/](../../../docs/routes/index.md) in the same
change.

```bash
bunx turbo lint typecheck --filter=@reclit/dashboard
bunx turbo build --filter=@reclit/dashboard
```

Then look at it: `bun run dev:dashboard` (http://localhost:4000), check light and
dark, and check narrow widths.
