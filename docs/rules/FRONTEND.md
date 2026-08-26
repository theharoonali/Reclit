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
│   ├── layout.tsx               # root: fonts, <html lang>, intl + <Providers>. No chrome, ever.
│   ├── providers.tsx            # tRPC + theme providers
│   ├── (app)/layout.tsx         # renders <AppShell> — the ONE chrome mount point
│   └── (app)/<route>/page.tsx   # thin: framing, prefetch, one feature component
├── components/
│   ├── layout/                  # app-shell · app-sidebar · app-header
│   ├── common/                  # cross-feature, feature-agnostic (see the ladder)
│   └── <feature>/               # this feature's components, small, kebab-case
├── config/nav.ts                # nav/menu data — never hardcoded in chrome
├── i18n/                        # config.ts (locales) · request.ts (per-request locale)
├── messages/<locale>.json       # every user-facing string. en.json is the source of truth
├── hooks/use-*.ts               # reusable client hooks
├── lib/                         # pure helpers: formatters, guards. No JSX, no fetching.
├── trpc/                        # client/server wiring. Never add feature logic here.
└── styles/globals.css           # app-level CSS only. Tokens live in @reclit/ui.
```

Shared primitives live in `packages/ui/src/components/` and are imported by
subpath (`@reclit/ui/button`) — see [shadcn](#shadcn) below.

> Today the dashboard has two routes (`/` and `/resume`), the chrome in
> `components/layout/`, and `components/common/` holding `loading-state` and
> `error-state`. There is still no data-bound feature component.

### Pages are thin

A `page.tsx` may contain: metadata, `export const dynamic`, a server prefetch, a
page heading, and one or two feature components. No data transformation, no
business logic, no inline markup beyond page framing. If a page is over ~60
lines, the markup belongs in a component.

## The chrome: few components, easy to redesign

The whole application shell is **three files**, and every page gets it from the
route-group layout — never by rendering chrome itself.

| File | Owns | Rule |
| --- | --- | --- |
| `components/layout/app-shell.tsx` | the grid **and the scroll model**: sidebar + header + `{children}` | the only file that knows the overall page geometry |
| `components/layout/app-sidebar.tsx` | side menu, collapsed/expanded state | renders `navSections` + `bottomNavItems` from `config/nav.ts` — no hardcoded links |
| `components/layout/app-header.tsx` | top bar: title slot, actions slot, search | takes slots as props; knows nothing about any feature |

Consequences you must preserve:

- **Adding a page never touches the chrome** — you add an entry to
  `config/nav.ts` and a `page.tsx`.
- **Redesigning the layout touches one file** (`app-shell.tsx`) for geometry, or
  the token file for the look. If a redesign would require editing pages, the
  shell is leaking and must be fixed instead.
- No page renders its own sidebar or header. A page that needs different chrome
  gets a second route group, not a bespoke layout.
- There is no footer. If one is ever needed, it is a fourth file here plus its
  data in `config/nav.ts` — never markup pasted into `app-shell.tsx`.
- Nav state (active item) derives from `usePathname()` inside the sidebar. Pages
  do not pass it down.
- **The chrome does not scroll.** The shell is a fixed-viewport frame (`h-dvh` +
  `overflow-hidden`); `<main>` is the only scroll container, and the sidebar's
  `<nav>` scrolls on its own when the menu is tall. A page must never set
  `min-h-screen`, `h-screen` or its own `overflow` — that creates a second
  scrollbar and breaks the frame. Size page content normally and let `<main>`
  scroll it.
- Inside that frame, `sticky` positions against `<main>`, not the viewport. A
  sticky page element sits below the header automatically; it does not need a
  `top` offset for it.
- **`<main>` has no padding — pages own their gutters.** A normal page wraps its
  content in `px-4 py-8 md:px-8` (see `(app)/page.tsx`); a full-bleed page adds
  nothing and gets the whole area. Padding in the shell would make an
  edge-to-edge page impossible without negative margins.
- A page that must **fill** the frame rather than flow inside it (an embedded
  document, a map, an editor) uses `h-full` on its wrapper — `<main>` has a
  definite height, so that resolves — and lets its own child own the scrolling.
  See [`/resume`](../routes/resume.md).

**Nothing in this app is framed**, and `next.config.ts` sends
`X-Frame-Options: DENY` accordingly. Do not reach for an `<iframe>` to embed a
document: a browser or extension that treats the file type as a download (IDM,
Chrome's "download PDFs" setting) will grab it instead of rendering it, and no
response header overrides that. Render the content yourself — see
[`/resume`](../routes/resume.md).

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
  record — it is not two components. Nothing in the repo demonstrates this yet;
  the first feature form is the one to get it right.
- No wrapper-of-a-wrapper. If a component only forwards props, delete it.
- Presentation and data-fetching split at ~150 lines: a `<feature>-panel.tsx`
  that queries, and `<feature>-list.tsx` / `<feature>-form.tsx` that render.
- These belong in `components/common/` the moment a second feature needs them,
  and are the expected names: `page-header`, `empty-state`, `error-state`,
  `loading-state`, `confirm-dialog`, `data-table`, `form-field`.
- **`loading-state` and `error-state` already exist — use them.** Never
  hand-roll a spinner or a failure paragraph in a feature. `LoadingState` fills
  its parent and centres `@reclit/ui/spinner`; give it a `label`, which is read
  by screen readers rather than drawn. A parent with a definite height centres
  it on the page.

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
  | fonts | `packages/ui/tailwind.config.ts` | `font-sans`/`font-mono` → `--font-sans`/`--font-mono`, set in `app/layout.tsx` (`Google_Sans` + `Geist_Mono`) |
  | type scale | `packages/ui/tailwind.config.ts` | `theme.extend.fontSize` — see [Typography](#typography) |
  | scrollbars | `packages/ui/src/globals.css` | 8px, pill thumb on `--border`, transparent track — applied globally, never per-component |
  | animations | `packages/ui/tailwind.config.ts` | `theme.extend.keyframes` + `theme.extend.animation` |
  | spacing, breakpoints, shadows | `packages/ui/tailwind.config.ts` | `theme.extend` |

  Need a colour that is not a token? **Add the token** — to both `:root` and
  `.dark` — and use it. Never inline the value.
- **Watch the token format before using an alpha modifier.** Some tokens are
  stored comma-separated (`--border: 45, 5%, 85%`) and others space-separated
  (`--primary: 20 90% 55%`). `hsl(var(--token) / 0.5)` is valid only for the
  space-separated form; with commas it produces invalid CSS that fails silently.
  Tailwind's `bg-primary/10` is safe on space-separated tokens; hand-written CSS
  in `globals.css` must check first.
- `apps/dashboard/tailwind.config.ts` only sets `content` and the preset. Theme
  changes go in the preset so the app and the package stay in sync.
- `apps/dashboard/src/styles/globals.css` is for app-level CSS only (document
  sizing, resets). Design tokens never go here.
- Class order: layout → box → typography → colour → state. Compose conditionals
  with `cn()`, never string concatenation.
- Mobile-first: unprefixed styles are the small screen; add `md:`/`lg:` upward.

### Typography

**Text sizing is global.** Every size, its line-height, its weight and its
tracking live in one place — `theme.extend.fontSize` in
`packages/ui/tailwind.config.ts` — so restyling the app's headings is one edit,
not a sweep through every component.

| Class | Use for | Size / weight |
| --- | --- | --- |
| `text-display` | a hero number or marketing headline | 2rem / 600 |
| `text-title` | the page `h1` | 1.5rem / 600 |
| `text-heading` | a section `h2`, the app name | 1.125rem / 600 |
| `text-subheading` | a card or panel `h3` | 1rem / 500 |
| `text-subtitle` | the muted line under a title, body copy | 0.875rem / 400 |
| `text-body` | default body and control text | 0.875rem / 400 |
| `text-label` | form labels, buttons, dense UI | 0.875rem / 500 |
| `text-caption` | timestamps, badges, section eyebrows | 0.75rem / 400 |

- **Raw Tailwind size steps are prohibited in components** — `text-sm`,
  `text-2xl`, `text-base` and friends are bugs. If a component needs a size the
  scale does not have, add a named entry to the scale; never reach for a step.
- Each entry already carries its weight, so **do not pair it with
  `font-medium`/`font-semibold`** unless you are deliberately overriding it.
- Same for line-height and tracking: `leading-*` and `tracking-*` alongside a
  scale class means the scale is wrong. Fix the scale.
- `font-sans`/`font-mono` are the only font utilities. Never name a family in a
  component.

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

## Internationalisation

Every user-facing string is a message key. **A literal in a component is a bug** —
it cannot be translated and nobody will find it later.

| Piece | Path |
| --- | --- |
| locale list, default, cookie name | `src/i18n/config.ts` |
| per-request locale + message loading | `src/i18n/request.ts` |
| the strings | `src/messages/<locale>.json` |
| provider | `NextIntlClientProvider` in `app/layout.tsx` |

- **Server components:** `const t = await getTranslations("namespace")` from
  `next-intl/server`. **Client components:** `const t = useTranslations("namespace")`
  from `next-intl`. Page metadata uses `generateMetadata` + `getTranslations`.
- **`en.json` is the source of truth.** Adding a language is: add the code to
  `locales` in `src/i18n/config.ts`, add `src/messages/<code>.json`, translate
  every key. A missing key throws in development.
- **Nav and config data hold keys, not text** — `config/nav.ts` carries
  `labelKey`/`titleKey`, and the sidebar resolves them. Never put display copy
  in a config file.
- **Not everything is copy.** Brand names (`APP_NAME`), workspace and user names
  are data and stay literal. Translate what a translator would change.
- Namespace by surface — `nav`, `sidebar`, `header`, `dashboard`, `metadata` —
  not by component. Components are renamed more often than surfaces.
- **Error boundaries stay in English.** `app/error.tsx` and
  `app/global-error.tsx` deliberately do not call `useTranslations`:
  `global-error.tsx` replaces the root layout, so no provider is mounted above
  it, and an error boundary must not depend on context that may itself be what
  broke.
- There is **no `[locale]` URL segment and no middleware**. The locale is read
  from the `locale` cookie with a fallback to `defaultLocale`. The cost is that
  every route renders dynamically, since reading a cookie opts out of static
  prerendering — accept it, or move to routed locales.

## Client boundaries

- `"use client"` only where interactivity actually requires it — on the leaf
  component, not the page and not the layout.
- Never import API runtime code; types only.
- No `useEffect` for data fetching — that is TanStack Query's job.
