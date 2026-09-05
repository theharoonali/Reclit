# Frontend Rules

`apps/dashboard` — Next.js 16 App Router, Tailwind, shadcn-style `@reclit/ui`.
Shared rules: [COMMON.md](COMMON.md). Frontend tests: [TESTING.md](TESTING.md).

**Building UI against an API? Read only the contract header of
`apps/api/src/__tests__/<feature>.api.test.ts`.** Never read backend source to
learn a shape.

## Where code goes

```
apps/dashboard/src/
├── app/
│   ├── layout.tsx                 # root: fonts, <html lang>, intl + <Providers>. No chrome, ever
│   ├── providers.tsx              # tRPC + theme (forcedTheme="light")
│   ├── error.tsx · global-error.tsx  # boundaries; both render common/error-fallback
│   ├── (app)/layout.tsx           # <WorkspaceProvider> + <AppShell> — the ONE chrome mount point
│   ├── (app)/<route>/page.tsx     # thin: metadata, prefetch, <PageShell>, one feature component
│   └── (public)/…                 # a second route group = different chrome (none, here)
├── components/
│   ├── layout/                    # app-shell · app-sidebar · sidebar-credits · app-header · header-actions
│   ├── common/                    # cross-feature: page-shell · form-field · loading-state · error-state · error-fallback
│   ├── workspace/                 # workspace-provider (useWorkspace) · account-menu · create-workspace-dialog · workspace-header-title
│   └── <feature>/                 # this feature's components AND its hooks (use-*.ts), kebab-case
├── config/                        # nav.ts (menu data, keys not text) · populate.ts · subscription.ts (stubs)
├── hooks/use-*.ts                 # feature-agnostic hooks: use-canvas-surface · use-file-picker · use-latest-ref · use-reseed
├── i18n/                          # config.ts (locales) · request.ts (per-request locale) · metadata.ts (pageMetadata)
├── lib/                           # pure helpers and thin fetch wrappers (api-fetch.ts). No JSX
├── messages/<locale>.json         # every user-facing string; en.json is the source of truth
├── trpc/                          # client.tsx · server.tsx · query-client.ts · logger-link.ts. No feature logic
└── styles/globals.css             # app-level CSS only (document sizing). Tokens live in @reclit/ui
```

Shared primitives live in `packages/ui/src/components/` and are imported by
subpath (`@reclit/ui/button`) — see the [inventory](#reclitui-inventory).
Routes today: `/`, `/ai-spreadsheet`, `/populate`, `/settings` (the `(app)`
group) and `/form/[spreadsheetId]` (the `(public)` group).

### Adding a page

1. Add its entry to `config/nav.ts` (`labelKey`, not text). Never edit the
   sidebar — it renders that config and derives the active row from
   `usePathname()`.
2. Create `app/(app)/<route>/page.tsx`:
   - `export const generateMetadata = () => pageMetadata("<namespace>")`
     from `@/i18n/metadata`;
   - `export const dynamic = "force-dynamic"` if it reads live data (otherwise
     Next prerenders it at build time and the build fails);
   - a server prefetch (`prefetch(trpc.x.y.queryOptions())` + `<HydrateClient>`
     from `@/trpc/server`) when the first paint should carry data;
   - `<PageShell title description narrow?>` from `@/components/common/page-shell`
     around one or two feature components. A page that must **fill** the frame
     (an editor, a map) renders `<div className="h-full">` instead — `<main>`
     has a definite height, so that resolves.
3. Put the components in `components/<feature>/`, the strings under a new
   namespace in `messages/en.json`, any page-level control inside
   `<HeaderActions>` ([below](#headeractions-and-headertitle)).
4. Write `docs/routes/<route>.md` from `_template.md` and add its row to
   `docs/routes/index.md`.
5. `bunx turbo lint typecheck --filter=@reclit/dashboard`, then open it.

A `page.tsx` contains framing and composition only: no data transformation, no
business logic, no markup beyond `PageShell`. Over ~40 lines, the markup
belongs in a component.

## The chrome

The application shell is five files in `components/layout/`, and every page
gets it from the route-group layout — never by rendering chrome itself.

| File | Owns |
| --- | --- |
| `app-shell.tsx` | the grid **and the scroll model**: sidebar beside header + `<main>`. The only file that knows the page geometry |
| `app-sidebar.tsx` | the side menu, collapsed/expanded state; renders `navSections` from `config/nav.ts`; account menu and credits at the bottom |
| `sidebar-credits.tsx` | the credits meter above the account block, from `config/subscription.ts` |
| `app-header.tsx` | the top bar: the title outlet (left) and the actions outlet (right). Knows nothing about any feature |
| `header-actions.tsx` | the two portals that put a page's title and controls into the header |

Rules that follow:

- **Adding a page never touches the chrome.** Redesigning the layout touches
  `app-shell.tsx` for geometry, or `tokens.ts` for the look. If a redesign
  would require editing pages, the shell is leaking — fix the shell.
- A page that needs different chrome gets a second route group (`(public)`),
  never a bespoke layout. There is no footer in `(app)`.
- **The chrome does not scroll.** The shell is `h-dvh` + `overflow-hidden`;
  `<main>` is the only scroll container, and the sidebar's `<nav>` scrolls on
  its own. A page never sets `min-h-screen`, `h-screen` or its own `overflow`.
  `sticky` positions against `<main>`, so a sticky element needs no `top`
  offset for the header.
- **`<main>` has no padding — `PageShell` owns the gutters**, so a full-bleed
  page gets the whole area without negative margins.
- Nothing is framed (`X-Frame-Options: DENY` in `next.config.ts`). Render a
  document yourself; never reach for an `<iframe>`.

### HeaderActions and HeaderTitle

```tsx
import { HeaderActions } from "@/components/layout/header-actions";

<HeaderActions>
  {error && <p role="alert" className="text-caption text-destructive">{error}</p>}
  <Button size="sm" variant="outline" onClick={…}><Upload aria-hidden="true" />{label}</Button>
</HeaderActions>
```

A page-level control belongs in the header, not in a bar of its own. Render
`<HeaderActions>` (right) or `<HeaderTitle>` (left) from the client component
that owns the control's state and it is portalled into `AppHeader`'s outlet —
the state stays where it is, only the DOM moves, and the header still imports
no feature. The outlets exist only under `(app)`; the portal renders nothing on
the first client paint (before the outlet has mounted). The sheet's controls
are the reference: `components/ai-spreadsheet/ai-spreadsheet-header-action.tsx`.

### useWorkspace

`WorkspaceProvider` (mounted in `(app)/layout.tsx`) owns the `workspace.list`
query and the active workspace. Any workspace-scoped page reads
`const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace()`
from `@/components/workspace/workspace-provider`. `activeWorkspace` is `null`
while the list loads; the choice persists under the localStorage key
`reclit.activeWorkspaceId`.

## Reuse before you build

Search first, then climb the ladder in [COMMON.md §4](COMMON.md) — exists →
import · nearly exists → add a prop or `cva` variant · two features →
`components/common/` · two apps or purely generic → `packages/ui` plus an
`exports` entry in `packages/ui/package.json`. Forking a "v2" is prohibited; a
component that only forwards props is deleted.

`components/common/` today: `page-shell` (page frame + title), `form-field`
(label stacked over one control), `loading-state` (fills its parent, centres
the spinner, `label` for screen readers), `error-state` (`message`),
`error-fallback` (the error boundaries' body). Reach for these before writing
markup; the next shared piece (an `empty-state`, a `confirm-dialog`, a
`data-table`) is born here the moment a second feature needs it.

Worked examples: a query with all three states —
`components/settings/profile-settings.tsx`; a mutation that invalidates —
`components/workspace/create-workspace-dialog.tsx`; one form for create *and*
edit (optional record) — `components/ai-spreadsheet/ai-spreadsheet-column-form.tsx`;
a feature-owned hook set — `components/ai-spreadsheet/use-*.ts`.

Presentation and data-fetching split at ~150 lines: a `<feature>-panel.tsx`
that queries, and `<feature>-list.tsx` / `<feature>-form.tsx` that render.

## `@reclit/ui` inventory

| Import | Exports | Notes |
| --- | --- | --- |
| `@reclit/ui/avatar` | `Avatar`, `AvatarImage`, `AvatarFallback` | fallback shows until the image loads |
| `@reclit/ui/button` | `Button`, `buttonVariants` | `variant`: `default` · `secondary` · `outline` · `ghost` · `destructive` · `destructive-outline` · `link`; `size`: `default` · `sm` · `lg` · `icon`; `asChild` |
| `@reclit/ui/calendar` | `Calendar` | inline month over `react-day-picker`, no popover |
| `@reclit/ui/capsule-select` | `CapsuleSelect` | single-choice pill row, radiogroup semantics |
| `@reclit/ui/checkbox` | `Checkbox` | Radix |
| `@reclit/ui/dialog` | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose` | Radix, unanimated |
| `@reclit/ui/dropdown-menu` | `DropdownMenu`, `…Trigger`, `…Content`, `…Item`, `…CheckboxItem`, `…RadioGroup`, `…RadioItem`, `…Label`, `…Separator`, `…Sub*` | Radix, unanimated |
| `@reclit/ui/input` | `Input` | single-line field |
| `@reclit/ui/label` | `Label` | a plain `<label>` |
| `@reclit/ui/progress` | `Progress` | `value`, `max`; plain divs |
| `@reclit/ui/select` | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator` | Radix; the trigger is `Input`'s twin |
| `@reclit/ui/spinner` | `Spinner` | `size`: `sm` · `default` · `lg`; decorative — the parent announces loading |
| `@reclit/ui/textarea` | `Textarea` | multi-line field |
| `@reclit/ui/tooltip` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`, `TooltipPortal` | Radix, unanimated |
| `@reclit/ui/cn` · `@reclit/ui/focus-ring` · `@reclit/ui/tokens` | `cn` · `focusRing`, `focusField`, `focusOutline` · the design tokens | helpers |

- **Every `Button` carries an explicit `variant`.** `default` is the one
  primary action on a surface; `secondary` supports it; `outline` is a neutral
  edged action; `ghost` is for dense or repeated actions (icon buttons,
  cancel); `destructive` is delete and nothing else; `destructive-outline` a
  destructive action that is not the surface's emphasis; `link` reads as text.
- **An icon inside a `Button` gets no classes.** The base sizes any `svg`
  child and spaces it — `<Plus />`, never `<Plus className="mr-2 h-4 w-4" />`.
  Icons are `lucide-react`.
- **Never hand-roll a form control.** A bare `<button>`, `<input>`, `<select>`
  or `<label>` with utility classes in a feature or chrome component is a bug.
  The only exception is a control the user never sees — the hidden file input
  from `useFilePicker`, the grid's hidden input proxy. If the primitive is
  missing a case, add a variant or a prop to it.
- **A label over a control is `FormField`**, never a hand-written wrapper.

### shadcn

- shadcn components are shared primitives: `packages/ui/src/components/<name>.tsx`
  plus `"./<name>": "./src/components/<name>.tsx"` in the `exports` map. Never
  copy one into `apps/dashboard`. Radix dependencies go in
  `packages/ui/package.json`, and only when a primitive genuinely needs one.
- Keep the generated source except for two edits: import `cn` from `../utils`,
  and **strip every enter/exit animation class** — a stuck exit animation
  keeps the node mounted and swallows clicks. `@reclit/ui` is unanimated.
- Variants are `cva` in the component file. A consumer that needs a new look
  gets a new variant there, not a `className` full of raw utilities.
- Focus is never written inline: compose `focusRing` (buttons, links, anything
  without a resting border — a halo), `focusField` (bordered text controls —
  border colour only) or `focusOutline` (a control against a border) from
  `@reclit/ui/focus-ring`. All three carry `outline-none`; `aria-invalid`
  swaps the colours to `--destructive`. Never suppress focus globally.

## Styling

- **Tailwind only.** No CSS modules, no styled-components, no inline `style`
  (except a measured or Radix-provided pixel value), no raw hex, no arbitrary
  values.
- **Semantic tokens, never literal colours:** `bg-background`,
  `text-muted-foreground`, `border-input`, `text-destructive`, `bg-card`.
  `bg-white` and `text-gray-500` are bugs.
- Class order: layout → box → typography → colour → state. Compose
  conditionals with `cn()`, never string concatenation. Mobile-first.
- `apps/dashboard/tailwind.config.ts` only sets `content` and the preset;
  `apps/dashboard/src/styles/globals.css` holds document sizing only.

### Design tokens

**`packages/ui/src/tokens.ts` is the one file where the design is edited.**
Everything else derives from it:

| Export | Becomes |
| --- | --- |
| `colors.light` / `colors.dark` | CSS variables `--<token>` on `:root` / `.dark`, emitted by the Tailwind preset, and the colour classes `bg-primary`, `text-muted-foreground`, `border-input`, `bg-overlay/overlay` … |
| `radius` | `--radius` → the app's one corner, `rounded-sm` |
| `fontSize` | the type scale, `text-display` … `text-eyebrow` |
| `sizes` | every named length, usable after any length prefix: `h-control`, `h-control-sm`, `px-control-x`, `size-icon`, `px-field-x`, `size-checkbox`, `size-avatar`, `w-sidebar`, `w-sidebar-rail`, `w-panel`, `h-header`, `h-sheet-header` … |
| `opacity.overlay` | the dialog scrim's alpha |
| `motion` | `duration-smooth`, `ease-smooth` — the one motion setting |
| `SHEET_HEADER_PX` | the canvas header height, shared by the DOM strip and the canvas geometry |

- **Add a colour** = one key in `light` (the type forces `dark` to match).
  **Add a size** = one key in `sizes`. Nothing else needs to learn the name:
  the preset exposes it and `cn()` reads the same object, so overrides dedupe.
- Colours are **space-separated HSL triples** (`20 90% 55%`) so
  `hsl(var(--x) / 0.5)` and `/alpha` modifiers work. The comma form fails
  silently.
- **Control and chrome dimensions are tokens; layout spacing is not.** A
  primitive's height, padding, icon size, the sidebar, header and panel widths
  come from `sizes` — a raw `h-9`, `px-4` or `w-56` in a primitive or chrome
  file is a bug. Spacing *between* elements (`gap-4`, `space-y-8`, `p-6`) uses
  Tailwind's default scale.
- The canvas sheet reads the same tokens (`lib/ai-spreadsheet/theme-colors.ts`
  reads the CSS variables; its first-paint fallback is built from
  `colors.light`), so the painted grid follows this file too.
- `globals.css` in `packages/ui` holds base element styles, scrollbars and the
  `.scrollbar-none` utility — never a token value.
- Fonts: `font-sans` / `font-mono` map to `--font-sans` / `--font-mono`, set
  by `next/font` in `app/layout.tsx` (`Google_Sans` + `Geist_Mono`). Never
  name a family in a component.
- **Dark mode is defined but off.** `providers.tsx` passes
  `forcedTheme="light"`; removing that prop enables the `.dark` tokens.
- Editing `tokens.ts` while `bun dev` runs may need a dev-server restart for
  the new class names to appear; the preset is loaded once.

### Radius

`rounded-sm` (`--radius - 4px`) is the app's one corner — divs, cards, buttons,
inputs, selects, popovers, dialogs, menus, nav items, avatars, chips.
`rounded-full` is for pills and `rounded-none` for the rare square; no other
step exists in the config, so `rounded-md`/`rounded-lg` are bugs. A surface
that seems to need a different corner means `radius` is wrong — change it.

### Typography

Every size, line-height, weight and tracking is one entry in `fontSize`:

| Class | Use for |
| --- | --- |
| `text-display` | a hero number or marketing headline |
| `text-title` | the page `h1` |
| `text-heading` | a section `h2`, the app name |
| `text-subheading` | a card or panel `h3` |
| `text-subtitle` | the muted line under a title |
| `text-body` | body and control text |
| `text-label` | form labels, buttons, dense UI |
| `text-caption` | timestamps, badges, inline errors |
| `text-eyebrow` | uppercase section headings in the nav |

Raw steps (`text-sm`, `text-2xl`) are bugs — add a named entry instead. Each
entry carries its weight, line-height and tracking, so `font-medium`,
`leading-*` or `tracking-*` beside a scale class means the scale is wrong.

## Data

- Client components: `useTRPC()` + `useQuery(trpc.x.y.queryOptions(input))`.
- Server components: `prefetch(trpc.x.y.queryOptions())` + `<HydrateClient>`
  from `@/trpc/server`.
- Mutations: `useMutation(trpc.x.y.mutationOptions({ onSuccess }))` and
  **invalidate the query they affect** —
  `queryClient.invalidateQueries({ queryKey: trpc.x.y.queryKey() })`. The
  sheet's local-model writes are the one recorded exception
  ([ai-spreadsheet.md](../routes/ai-spreadsheet.md)).
- **Always handle all three states**: `isPending` → `<LoadingState>`,
  `isError` → `<ErrorState>`, and empty.
- Payload and response types come from `RouterInputs` / `RouterOutputs`. Never
  hand-write an interface for an API shape ([COMMON.md](COMMON.md)).
- Multipart uploads use `postFile` from `lib/api-fetch.ts`; `API_BASE_URL`
  there is the only place the API origin is resolved.

## Internationalisation

Every user-facing string is a message key. **A literal in a component is a
bug** — it cannot be translated and nobody will find it later.

| Piece | Path |
| --- | --- |
| locale list, default, cookie name | `src/i18n/config.ts` |
| per-request locale + message loading | `src/i18n/request.ts` |
| page metadata | `pageMetadata(namespace)` in `src/i18n/metadata.ts` |
| the strings | `src/messages/<locale>.json` |
| provider | `NextIntlClientProvider` in `app/layout.tsx` |

- Server components: `await getTranslations("namespace")` from
  `next-intl/server`. Client components: `useTranslations("namespace")` from
  `next-intl`.
- **Namespace by surface, one per feature or chrome area** — today `nav`,
  `sidebar`, `account`, `workspace`, `settings`, `dashboard`, `metadata`,
  `aiSpreadsheet`, `populate`, `publicForm`. A new feature adds its own.
- **`en.json` is the source of truth.** Adding a language: add the code to
  `locales` in `i18n/config.ts`, add `messages/<code>.json`, translate every
  key. A missing key throws in development.
- Config data holds keys, not text (`config/nav.ts` carries `labelKey` /
  `titleKey`). Brand, workspace and user names are data and stay literal.
- **Error boundaries stay in English.** `ErrorFallback` deliberately does not
  call `useTranslations`: `global-error.tsx` replaces the root layout, so no
  provider is mounted above it.
- There is no `[locale]` URL segment and no middleware; the locale comes from
  the `locale` cookie, which makes every route render dynamically.

## Client boundaries

- `"use client"` only where interactivity requires it — on the leaf component,
  not the page and not the layout.
- Never import API runtime code; types only.
- No `useEffect` for data fetching — that is TanStack Query's job. For a
  stable callback that must see the latest value, `useLatestRef`; for local
  draft state that follows a prop while mounted, `useReseed`.
