# `/`

**Purpose:** The dashboard home, and the mount point for the application shell.
It is the reference for chrome — sidebar and header — not for data.

**Rendering:** dynamic. The page itself calls no procedure and carries no
`export const dynamic` — but `i18n/request.ts` reads the `locale` cookie on
every request, which opts the whole app out of static prerendering. The build
reports `/` as `ƒ (Dynamic)`.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/layout.tsx` | RSC | The **one** chrome mount point — renders `<AppShell>` around every route in the group |
| `apps/dashboard/src/app/(app)/page.tsx` | RSC | Page framing only: heading, subtitle, one component |
| `apps/dashboard/src/components/layout/app-shell.tsx` | RSC | Page geometry: sidebar beside a column of header + `main`. The only file that knows the layout |
| `apps/dashboard/src/components/layout/app-sidebar.tsx` | client | Collapse state (`useState`, `w-56` ↔ `w-16`), app name + collapse toggle, grouped nav, workspace block. Active row from `usePathname()` |
| `apps/dashboard/src/components/layout/app-header.tsx` | RSC | Search field, notifications, avatar. Takes `title`/`actions` slots as props. Has no interactive element, so it is not a client component |
| `apps/dashboard/src/components/dashboard/dashboard-empty.tsx` | RSC | The page's only body content |
| `apps/dashboard/src/config/nav.ts` | data | `navSections`, `APP_NAME`, `WORKSPACE`, `PLACEHOLDER_USER`. Chrome never hardcodes a link |
| `apps/dashboard/src/app/layout.tsx` | RSC | Root layout: fonts (`Google_Sans` + `Geist_Mono`), `<html lang>` from `getLocale()`, `NextIntlClientProvider`, `Providers`. No chrome |
| `apps/dashboard/src/i18n/config.ts` | data | Locale list, default locale, cookie name |
| `apps/dashboard/src/i18n/request.ts` | server | Resolves the request locale from the cookie and loads its messages |
| `apps/dashboard/src/messages/en.json` | data | Every user-facing string on this page |
| `apps/dashboard/src/app/providers.tsx` | client | `TRPCReactProvider` + `next-themes` pinned to light via `forcedTheme="light"` |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`, `@reclit/ui/cn`.
Icons are `lucide-react` (a dashboard dependency, not a `@reclit/ui` one).

## APIs called

**None.** This page calls no procedure and prefetches nothing. The tRPC client
and server wiring in `src/trpc/` is mounted and working but currently has no
consumer; `note.list`, `note.byId`, `note.create`, `note.update` and
`note.remove` are exercised only by
`apps/api/src/__tests__/note.api.test.ts`. `GET /health`
(`apps/api/src/app.controller.ts`) is not called here either.

## Behaviour

- **The sidebar and header are fixed; only the page area scrolls.** The shell
  fills the viewport and hides its own overflow, so chrome cannot scroll away.
  The sidebar's nav scrolls independently once the menu outgrows its column.
- The sidebar collapses to an icon rail and expands back. The toggle sits in
  the sidebar's header row, to the right of the app name; when collapsed it is
  the only thing left in that row. There is no logo mark. It is
  labelled for screen readers and carries `aria-expanded`.
- Only `Dashboard` is a real destination. Every other nav item is `disabled` in
  `config/nav.ts` and renders as inert text with `aria-disabled="true"` — it is
  not a link, because `not-found.tsx` redirects unknown paths to `/` and a dead
  link would bounce the user home with no explanation.
- The active row is derived from `usePathname()` and marked `aria-current="page"`.
- **Light only.** `providers.tsx` passes `forcedTheme="light"`, so the `.dark`
  tokens in `@reclit/ui` can never apply and there is no theme control in the
  UI. Removing that one prop restores dark mode.
- Below the `md` breakpoint the sidebar is hidden entirely. **There is no mobile
  navigation** — that needs a `Sheet` primitive and `@radix-ui/react-dialog`.
- The search field is uncontrolled and searches nothing. The avatar and
  workspace blocks are static.
- The body is a single unconditional empty state. With no query there is no
  loading or error state to handle.
- **Every visible string comes from `src/messages/en.json`** — nav labels and
  section titles included, resolved from the `labelKey`/`titleKey` in
  `config/nav.ts`. The page title and description come from the same file via
  `generateMetadata`. `en` is the only locale and there is no switcher.
- **There is no footer.** The shell is sidebar + header only; every destination
  lives in the sidebar.

## Reusable pieces

- `AppShell` — adding a page means adding an entry to `config/nav.ts` and a
  `page.tsx` in the `(app)` group. It never means touching chrome.
- `AppHeader` takes `title` and `actions` slots; pass content in rather than
  editing the header for one page.
- Redesigning the layout is `app-shell.tsx` for geometry, or
  `packages/ui/src/globals.css` for the look. If a redesign needs page edits,
  the shell is leaking ([../rules/FRONTEND.md](../rules/FRONTEND.md)).

## Linked routes

None — this is the only route. Every `disabled` entry in `config/nav.ts` is a
route that does not exist yet.
