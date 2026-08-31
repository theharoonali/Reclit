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
| `apps/dashboard/src/app/(app)/layout.tsx` | RSC | The **one** chrome mount point — renders `<WorkspaceProvider>` around `<AppShell>` (plus `<WorkspaceHeaderTitle>`) for every route in the group |
| `apps/dashboard/src/app/(app)/page.tsx` | RSC | Page framing only: heading, subtitle, one component |
| `apps/dashboard/src/components/layout/app-shell.tsx` | RSC | Page geometry: sidebar beside a column of header + `main`. The only file that knows the layout |
| `apps/dashboard/src/components/layout/app-sidebar.tsx` | client | Collapse state (`useState`, `w-56` ↔ `w-16`), app name + current-plan capsule + collapse toggle, grouped nav, the credits block and account menu at the bottom. Active row from `usePathname()` |
| `apps/dashboard/src/components/layout/sidebar-credits.tsx` | client | Credits usage bar + used/total count above the account block, from the stub in `config/subscription.ts`. Hidden when collapsed |
| `apps/dashboard/src/components/layout/app-header.tsx` | RSC | Takes `title`/`actions` slots as props and mounts the two portal outlets (title left, actions right). Has no interactive element, so it is not a client component |
| `apps/dashboard/src/components/layout/header-actions.tsx` | client | The header's two portal slots: `HeaderActions` (right) and `HeaderTitle` (left), one implementation |
| `apps/dashboard/src/components/workspace/workspace-provider.tsx` | client | `useWorkspace()` — fetches `workspace.list`, resolves the active workspace, persists the choice in localStorage |
| `apps/dashboard/src/components/workspace/account-menu.tsx` | client | The sidebar's bottom block: avatar/name/email trigger (`user.me`) with a menu listing workspaces, "new workspace", a `/settings` link and a UI-only "Log out" |
| `apps/dashboard/src/components/workspace/create-workspace-dialog.tsx` | client | Name form → `workspace.create`; makes the new workspace active |
| `apps/dashboard/src/components/workspace/workspace-header-title.tsx` | client | Portals the active workspace's name into the header title slot |
| `apps/dashboard/src/components/dashboard/dashboard-empty.tsx` | RSC | The page's only body content |
| `apps/dashboard/src/config/nav.ts` | data | `navSections`, `APP_NAME`. Chrome never hardcodes a link |
| `apps/dashboard/src/config/subscription.ts` | data | Stubbed plan/credits data for the sidebar credits block and `/settings` |
| `apps/dashboard/src/app/layout.tsx` | RSC | Root layout: fonts (`Google_Sans` + `Geist_Mono`), `<html lang>` from `getLocale()`, `NextIntlClientProvider`, `Providers`. No chrome |
| `apps/dashboard/src/i18n/config.ts` | data | Locale list, default locale, cookie name |
| `apps/dashboard/src/i18n/request.ts` | server | Resolves the request locale from the cookie and loads its messages |
| `apps/dashboard/src/messages/en.json` | data | Every user-facing string on this page |
| `apps/dashboard/src/app/providers.tsx` | client | `TRPCReactProvider` + `next-themes` pinned to light via `forcedTheme="light"` |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`, `@reclit/ui/cn`.
Icons are `lucide-react` (a dashboard dependency, not a `@reclit/ui` one).

## APIs called

The page's body calls no procedure. The chrome does: `WorkspaceProvider`
queries `workspace.list` (client-side, no prefetch on this page) so the
sidebar menu and the header title can resolve the active workspace, the
account menu queries `user.me` for its avatar/name/email trigger, and the
account menu's create dialog calls `workspace.create` (invalidating
`workspace.list` and `spreadsheet.list`). Payloads: the contract header of
`apps/api/src/__tests__/workspace.api.test.ts`. `GET /health`
(`apps/api/src/app.controller.ts`) is not called here.

## Behaviour

- **The sidebar and header are fixed; only the page area scrolls.** The shell
  fills the viewport and hides its own overflow, so chrome cannot scroll away.
  The sidebar's nav scrolls independently once the menu outgrows its column.
- The sidebar collapses to an icon rail and expands back. The toggle sits in
  the sidebar's header row, to the right of the logo mark
  (`public/brand/icon-fill.png`), app name, and current-plan capsule; when
  collapsed it is the only thing left in that row. It is labelled for screen
  readers and carries `aria-expanded`.
- `Dashboard`, `AI Spreadsheet` and `Populate` are real destinations;
  `/settings` is reached from the account menu (there is no pinned Settings
  nav row).
- The active row is derived from `usePathname()` and marked `aria-current="page"`.
- **Light only.** `providers.tsx` passes `forcedTheme="light"`, so the `.dark`
  tokens in `@reclit/ui` can never apply and there is no theme control in the
  UI. Removing that one prop restores dark mode.
- Below the `md` breakpoint the sidebar is hidden entirely. **There is no mobile
  navigation** — that needs a `Sheet` primitive and `@radix-ui/react-dialog`.
- The header is empty chrome plus its slots: the `HeaderTitle` outlet on the
  left (the active workspace's name, hidden below `lg`) and `actions` +
  `HeaderActions` outlet on the right. There is no search field, no
  notification bell and no header avatar.
- The account block at the bottom of the sidebar shows the user's (square)
  avatar, the active workspace's name and the user's email (`user.me`) and
  opens a menu above it, sized to the trigger so it stays inside the sidebar
  column: every workspace
  (picking one makes it active — persisted under the localStorage key
  `reclit.activeWorkspaceId`), a "New workspace" entry that opens the create
  dialog (the API allots the new workspace a same-named spreadsheet), a
  Settings link and a "Log out" item that is UI only — there is no auth.
  Collapsed, the trigger is the avatar alone.
- Above the account block sits the credits meter: a usage bar with the
  stubbed `700/1000` count. The current plan sits next to the logo as a
  capsule. It disappears when collapsed.
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
- `AppHeader` takes `title` and `actions` slots and mounts the portal outlets
  from `header-actions.tsx`; portal content in (`HeaderTitle` /
  `HeaderActions`) rather than editing the header for one page.
- Redesigning the layout is `app-shell.tsx` for geometry, or
  `packages/ui/src/globals.css` for the look. If a redesign needs page edits,
  the shell is leaking ([../rules/FRONTEND.md](../rules/FRONTEND.md)).

## Linked routes

- `/settings` ([settings.md](settings.md)) — reached from the account menu.
