# 002 — Dashboard shell: sidebar, header, orange theme

**Status:** implemented
**Scope:** frontend

## Goal

The dashboard gets an application shell. A collapsible sidebar carries the app
name, three grouped nav sections and a workspace block; a header carries a
search field and a profile avatar; the accent colour across the app becomes
orange, light mode only. `/` becomes the dashboard home — a page header and one
empty state, no charts and no invented metrics. The Note UI is removed from the
dashboard; the Note API is untouched.

## Backend (Agent 1)

None. `apps/api` is not modified. The `note.*` procedures, the Prisma model, the
service and `note.api.test.ts` all stay exactly as they are — the dashboard
simply stops calling them.

## Frontend (Agent 2)

- **Route(s):** `/` moves into a new `(app)` route group and becomes the
  dashboard. It reads no live data and carries no `export const dynamic`.
  (It nonetheless renders dynamically — the locale cookie added in
  [003](003-i18n.md) opts the app out of static prerendering.) Nav entry:
  `Dashboard`, the only enabled item.
- **Components:**

  | Path | New/changed | Owns |
  | --- | --- | --- |
  | `packages/ui/src/components/input.tsx` | new | shadcn `Input` primitive, exported as `@reclit/ui/input` |
  | `apps/dashboard/src/config/nav.ts` | new | `navSections`, `APP_NAME`, `WORKSPACE`, `PLACEHOLDER_USER` — the only place chrome content lives |
  | `apps/dashboard/src/components/layout/app-shell.tsx` | new | page geometry and the scroll model: a fixed-viewport frame with `<main>` as the only scroll container |
  | `apps/dashboard/src/components/layout/app-sidebar.tsx` | new | collapse state, app name, collapse toggle, grouped nav, workspace block |
  | `apps/dashboard/src/components/layout/app-header.tsx` | new | search, notifications, avatar. No interactive element, so RSC |
  | `apps/dashboard/src/components/dashboard/dashboard-empty.tsx` | new | the one empty state on the page |
  | `apps/dashboard/src/app/(app)/layout.tsx` | new | the single chrome mount point |
  | `apps/dashboard/src/app/(app)/page.tsx` | new | the dashboard page, thin |
  | `apps/dashboard/src/app/providers.tsx` | changed | `ThemeProvider` pinned with `forcedTheme="light"` |
  | `apps/dashboard/src/app/page.tsx` | deleted | the old Notes page |
  | `apps/dashboard/src/components/notes-panel.tsx` | deleted | the Notes CRUD UI |

- **States:** the page has no query, so there is no loading or error state to
  handle — the empty state is unconditional. Token change: `--primary`,
  `--primary-foreground` and `--ring` are repointed to orange in both `:root`
  and `.dark` in `packages/ui/src/globals.css`. No new tokens.

## Integration (Agent 3)

None. No component in this change calls a procedure.

## Decisions

- **Dashboard at `/`, not `/dashboard`** — the reference makes Dashboard the
  home item, and a shell whose home nav entry is not the app root reads as a bug.
- **Only the Notes UI is deleted, not the Note feature** — the backend slice is
  the repo's only working procedure and its only test; removing it would leave
  the tRPC wiring with nothing proving it works.
- **`--primary` is repointed rather than adding a `--brand` token** — two accent
  systems drift apart, and `Button`'s `default` variant already reads
  `bg-primary`, so one edit themes every existing consumer.
- **Light only, via `forcedTheme="light"`.** The `.dark` token block stays in
  `packages/ui/src/globals.css` — this is switched off, not deleted, so
  restoring dark mode is removing one prop. It cannot apply while the theme is
  forced, because Tailwind's `darkMode` is class-based.
- **The chrome is fixed; only the page scrolls.** The shell is `h-dvh` +
  `overflow-hidden`, so the sidebar and header are pinned and cannot be
  scrolled away. `<main>` owns the page scrollbar, and the sidebar's `<nav>`
  scrolls independently when the menu outgrows its column. This replaces the
  earlier `min-h-screen` + `sticky top-0` header, where the sidebar scrolled
  away with the page on a tall document.
  - `h-dvh`, not `h-screen`: `100vh` is clipped by mobile browser chrome.
  - `<main>` carries **no padding**. Gutters are a page's own concern, because a
    shell that pads its content cannot host a full-bleed page without negative
    margins. `(app)/page.tsx` adds `px-4 py-8 md:px-8`; a full-bleed page
    (`/ai-spreadsheet`) adds nothing.
  - Every flex child that scrolls carries `min-h-0`, and every one that must not
    be squeezed carries `shrink-0`. Without `min-h-0` a flex item's automatic
    minimum size defeats `overflow-y-auto` and the content overflows instead of
    scrolling — this is load-bearing, not decoration.
- **Typography is a global scale, not per-component sizes.** `text-title`,
  `text-heading`, `text-subtitle` and the rest live in
  `theme.extend.fontSize` in `packages/ui/tailwind.config.ts`, each carrying its
  own line-height, weight and tracking. Raw steps (`text-sm`, `text-2xl`) are
  banned in components, so resizing every heading is one edit.
- **`Google_Sans` for `--font-sans`**, confirmed present in this Next version's
  font list before use. `Geist_Mono` is left as `--font-mono`.
- **The sidebar is tinted with the existing `--card` token** — it is already a
  warm off-white, which is the separation the reference shows. Adding
  `--sidebar-*` tokens would duplicate values that already exist.
- **No footer.** The shell is three files, not the four
  [FRONTEND.md](../rules/FRONTEND.md) originally prescribed. A dashboard whose
  every destination is in the sidebar has nothing for a footer to carry, and a
  bar holding only a version string is noise.
- **The collapse toggle lives in the sidebar's header row**, right of the app
  name, and is all that remains there when collapsed.
  `PanelLeftClose` / `PanelLeftOpen`, not one rotated icon.
- **No logo mark.** The sidebar header is the app name as plain text. An
  invented placeholder glyph is worse than nothing — it reads as a real brand
  decision no one made. When a real logo exists it goes back in this one row.
- **Nav items without a route render disabled, not as `href="#"`** —
  `not-found.tsx` redirects to `/`, so a dead link silently bounces the user
  home with no explanation.
- **Collapse state is `useState`, not persisted** — reading `localStorage`
  during render is a hydration-mismatch risk for no real gain at this stage.
- **No `Card`, `Avatar` or `DropdownMenu` primitive** — one consumer each fails
  the reuse ladder (COMMON.md §4). They get promoted when a second consumer
  appears.

## Risks / open questions

- Deleting `notes-panel.tsx` removes the file that `.claude/agents/ui-agent.md`,
  `.claude/skills/frontend-feature/SKILL.md` and `docs/rules/FRONTEND.md` all
  cite as the reference for one form serving create and edit. Those references
  are updated here, but the repo is left with **no example of a data-bound
  feature component** until the next feature lands.
- The sidebar is `hidden md:flex` — below `md` there is no navigation at all. A
  real mobile drawer needs a `Sheet` primitive and `@radix-ui/react-dialog`.
- Collapsed, the sidebar shows only the toggle — no branding at all, since
  there is no logo mark. That is intended, but it is the thing to look at and
  reject if it reads wrong.
- `apps/dashboard/src/styles/globals.css` contains a blanket
  `*:focus { outline: none }`. New chrome uses `focus-visible:ring-*`, which is
  a ring rather than an outline and so is unaffected, but the rule remains a
  latent accessibility problem for anything that relies on outlines.

---

## Outcome

- **Shipped:**
  - Tokens: `--primary`, `--primary-foreground`, `--ring` repointed to orange in
    both `:root` and `.dark` in `packages/ui/src/globals.css`.
  - New primitive `packages/ui/src/components/input.tsx`, exported as
    `@reclit/ui/input`.
  - `apps/dashboard/src/config/nav.ts` — three nav sections plus `APP_NAME`,
    `WORKSPACE`, `PLACEHOLDER_USER`.
  - Chrome: `app-shell.tsx`, `app-sidebar.tsx`, `app-header.tsx` in
    `apps/dashboard/src/components/layout/`. Sidebar `w-56`, collapsing to
    `w-16`, fixed full-height on the left with its nav scrolling internally;
    header fixed; `<main>` the only scroll container.
  - Type scale in `packages/ui/tailwind.config.ts` (`display`, `title`,
    `heading`, `subheading`, `subtitle`, `body`, `label`, `caption`) and applied
    everywhere — no raw size step remains in any `.tsx`, error boundaries
    included. `FRONTEND.md` gained a Typography section stating the rule.
  - `--font-sans` switched from `Geist` to `Google_Sans` in `app/layout.tsx`.
  - `apps/dashboard/src/app/(app)/layout.tsx` + `(app)/page.tsx`, and
    `components/dashboard/dashboard-empty.tsx`.
  - `providers.tsx` forced to light; no theme control anywhere in the UI.
  - Deleted `apps/dashboard/src/app/page.tsx` and
    `apps/dashboard/src/components/notes-panel.tsx`.
  - `lucide-react@^1.34.0` added to `apps/dashboard/package.json`.
  - `docs/rules/COMMON.md` gained §2 "Don't guess — ask", and §8 "Plans" was
    rewritten: a follow-up prompt updates the current plan instead of opening a
    new one, and an open plan may be pruned. Old §2–§8 renumbered to §3–§9 and
    the `§` cross-references updated.

- **Deviated:**
  - `packages/ui/src/components/button.tsx` gained `rounded-md` on its `cva`
    base. The plan said no Button edit, but the component had no radius at all
    while `--radius` was already defined; square buttons beside rounded cards
    looked unintentional. One class, no API change.
  - `app-footer.tsx` and `footerItems` were built as planned, then deleted when
    the footer was cut. `FRONTEND.md`'s "the shell is four files" rule was
    corrected to three.
  - `bun add --filter=@reclit/dashboard` wrote the dependency to the **root**
    `package.json`, not the workspace. Reverted and added to
    `apps/dashboard/package.json` by hand, then `bun install`.

- **Not done:**
  - No mobile navigation. The sidebar is `hidden md:flex`; below `md` there is
    no nav at all. Needs a `Sheet` primitive and `@radix-ui/react-dialog`.
  - Search, notifications and the avatar are inert. No profile dropdown.
  - No page behind any `disabled` nav entry.
  - Collapse state is not persisted across reloads.
  - `next-themes` still wraps the tree and the `.dark` tokens still exist, both
    doing nothing while the theme is forced.
  - The blanket `*:focus { outline: none }` is untouched.
  - **The repo now has no example of a data-bound feature component.** The risk
    above was accepted, not avoided: `.claude/agents/ui-agent.md`,
    `.claude/skills/frontend-feature/SKILL.md` and `docs/rules/FRONTEND.md`
    were rewritten to point at the shell and to state plainly that the
    create-and-edit-in-one-form pattern is described but no longer
    demonstrated.

- **Never visually verified.** Every check was structural — served HTML, served
  CSS, lint, typecheck, production build. The browser pane could not composite
  frames in this environment, so no screenshot was taken and no one has
  confirmed how the shell actually looks.

- **Docs updated:** `docs/routes/root.md` (rewritten), `docs/routes/index.md`,
  `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/FRONTEND.md`,
  `docs/rules/COMMON.md`, `docs/plans/_template.md`,
  `.claude/agents/ui-agent.md`, `.claude/skills/frontend-feature/SKILL.md`.
  No feature doc changed — `apps/api` was not touched, and
  `docs/features/note.md` contains no frontend references.
