# Frontend Rules

`apps/dashboard` — Next.js 16 App Router, Tailwind, shadcn-style `@reclit/ui`.
Shared rules: [COMMON.md](COMMON.md). Integrating an API: [TESTING.md](TESTING.md).

**Building UI against an API? Read only the contract header of
`apps/api/src/__tests__/<feature>.api.test.ts`.** It is the payload/response
truth. Do not read backend source to learn a shape.

## Where code goes

```
apps/dashboard/src/
├── app/
│   ├── layout.tsx               # root: fonts + <Providers>. Nothing else, ever.
│   ├── providers.tsx            # tRPC + theme providers
│   ├── (app)/layout.tsx         # renders <AppShell> — the ONE chrome mount point
│   └── (app)/<route>/page.tsx   # thin: framing, prefetch, one feature component
├── components/
│   ├── layout/                  # app-shell · app-sidebar · app-header · app-footer
│   ├── common/                  # cross-feature, feature-agnostic (see the ladder)
│   └── <feature>/               # this feature's components, small, kebab-case
├── config/nav.ts                # nav/menu/footer data — never hardcoded in chrome
├── hooks/use-*.ts               # reusable client hooks
├── lib/                         # pure helpers: formatters, guards. No JSX, no fetching.
├── trpc/                        # client/server wiring. Never add feature logic here.
└── styles/globals.css           # app-level CSS only. Tokens live in @reclit/ui.
```

Shared primitives live in `packages/ui/src/components/` and are imported by
subpath (`@reclit/ui/button`) — see [shadcn](#shadcn) below.

> Today the dashboard has one route (`/`), one feature component
> (`components/notes-panel.tsx`) and no chrome. The paths above are where those
> files go as the app grows; `notes-panel.tsx` moves to `components/note/` when a
> second feature lands.

### Pages are thin

A `page.tsx` may contain: metadata, `export const dynamic`, a server prefetch, a
page heading, and one or two feature components. No data transformation, no
business logic, no inline markup beyond page framing. If a page is over ~60
lines, the markup belongs in a component.

## The chrome: few components, easy to redesign

The whole application shell is **four files**, and every page gets it from the
route-group layout — never by rendering chrome itself.

| File | Owns | Rule |
| --- | --- | --- |
| `components/layout/app-shell.tsx` | the grid: sidebar + header + `{children}` + footer | the only file that knows the overall page geometry |
| `components/layout/app-sidebar.tsx` | side menu, collapsed/expanded state | renders `navItems` from `config/nav.ts` — no hardcoded links |
| `components/layout/app-header.tsx` | top bar: title slot, actions slot, theme toggle | takes slots as props; knows nothing about any feature |
| `components/layout/app-footer.tsx` | footer links, version | renders `footerItems` from `config/nav.ts` |

Consequences you must preserve:

- **Adding a page never touches the chrome** — you add an entry to
  `config/nav.ts` and a `page.tsx`.
- **Redesigning the layout touches one file** (`app-shell.tsx`) for geometry, or
  the token file for the look. If a redesign would require editing pages, the
  shell is leaking and must be fixed instead.
- No page renders its own sidebar, header, or footer. A page that needs different
  chrome gets a second route group, not a bespoke layout.
- Nav state (active item) derives from `usePathname()` inside the sidebar. Pages
  do not pass it down.

## Reuse before you build

Search first. Then take the first rung that applies:

1. **`packages/ui` has it** → import it.
2. **`components/common/` has it** → import it.
3. **It nearly exists** → add a prop or a `cva` variant to the existing
   component. Forking a "v2" of a component is prohibited.
4. **Used by two features** → move it to `components/common/`.
5. **Used by two apps, or purely generic** → move it to `packages/ui` and add it
   to the `exports` map in `packages/ui/package.json`.

Rules that follow from this:

- **One component per job.** A form serving create *and* edit takes an optional
  record — it is not two components (see the form in `components/notes-panel.tsx`).
- No wrapper-of-a-wrapper. If a component only forwards props, delete it.
- Presentation and data-fetching split at ~150 lines: a `<feature>-panel.tsx`
  that queries, and `<feature>-list.tsx` / `<feature>-form.tsx` that render.
- These belong in `components/common/` the moment a second feature needs them,
  and are the expected names: `page-header`, `empty-state`, `error-state`,
  `loading-state`, `confirm-dialog`, `data-table`, `form-field`.

## shadcn

- shadcn components are **shared primitives**: they go in
  `packages/ui/src/components/<name>.tsx`, and every one gets an entry in the
  `exports` map of `packages/ui/package.json`
  (`"./dialog": "./src/components/dialog.tsx"`). Import as `@reclit/ui/dialog`.
  Never copy a shadcn component into `apps/dashboard`.
- Radix dependencies are added to `packages/ui/package.json`, not the dashboard.
- Keep the shadcn source as generated except for two required edits:
  1. import `cn` from `@reclit/ui/cn`;
  2. **strip enter/exit animation classes** (`data-[state=closed]:animate-out`,
     `data-[state=closed]:fade-out-0`, …). A stuck exit animation keeps the node
     mounted and swallows clicks. `@reclit/ui` components are unanimated by design.
- Variants are `cva` in the component file. A consumer that needs a new look gets
  a new variant there — not a `className` override full of raw utilities.

## Styling

- **Tailwind only.** No CSS modules, no styled-components, no inline `style`, no
  raw hex, no arbitrary values.
- **Use semantic tokens, never literal colors:** `bg-background`,
  `text-muted-foreground`, `border`, `text-destructive`, `bg-card`. `bg-white`
  and `text-gray-500` are bugs — they break dark mode.
- **Every global lives in `packages/ui`, and only there:**

  | Global | File | How |
  | --- | --- | --- |
  | colors | `packages/ui/src/globals.css` | HSL triples on `:root` and `.dark`, one per token |
  | border radius | `packages/ui/src/globals.css` | `--radius`; `rounded-sm/md/lg` derive from it |
  | fonts | `packages/ui/tailwind.config.ts` | `font-sans`/`font-mono` → `--font-sans`/`--font-mono`, set in `app/layout.tsx` |
  | animations | `packages/ui/tailwind.config.ts` | `theme.extend.keyframes` + `theme.extend.animation` |
  | spacing, breakpoints, shadows | `packages/ui/tailwind.config.ts` | `theme.extend` |

  Need a colour that is not a token? **Add the token** — to both `:root` and
  `.dark` — and use it. Never inline the value.
- `apps/dashboard/tailwind.config.ts` only sets `content` and the preset. Theme
  changes go in the preset so the app and the package stay in sync.
- `apps/dashboard/src/styles/globals.css` is for app-level CSS only (document
  sizing, resets). Design tokens never go here.
- Class order: layout → box → typography → colour → state. Compose conditionals
  with `cn()`, never string concatenation.
- Mobile-first: unprefixed styles are the small screen; add `md:`/`lg:` upward.

## Data

- Client components: `useTRPC()` + `useQuery(trpc.x.y.queryOptions(input))`.
- Server components: `prefetch(trpc.x.y.queryOptions())` + `<HydrateClient>` from
  `@/trpc/server`.
- Mutations: `useMutation(trpc.x.y.mutationOptions({ onSuccess }))` and
  **invalidate the query they affect** —
  `queryClient.invalidateQueries({ queryKey: trpc.x.y.queryKey() })`.
- A page that reads live database data must set
  `export const dynamic = "force-dynamic"`, otherwise Next tries to prerender it
  at build time and the build fails.
- **Always handle all three states**: `isLoading`, `error`, and empty.
- Payload and response types come from `RouterInputs`/`RouterOutputs`. Never
  hand-write an interface for an API shape ([COMMON.md](COMMON.md)).

## Client boundaries

- `"use client"` only where interactivity actually requires it — on the leaf
  component, not the page and not the layout.
- Never import API runtime code; types only.
- No `useEffect` for data fetching — that is TanStack Query's job.
