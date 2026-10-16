# `/`

**Purpose:** The dashboard home — the workspace's backend-configured dashboard,
computed in the browser from its sheet — and the mount point for the
application shell. It is the reference for chrome (sidebar and header) and for
the "config from the API, data from the sheet" pattern.

**Rendering:** dynamic (`export const dynamic = "force-dynamic"`; the page
reads live data). The page itself is framing only: it passes the default
title and subtitle into `<DashboardPanel>`, which fetches the config on the
client because the active workspace is client state (localStorage).

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/layout.tsx` | RSC | The **one** chrome mount point — renders `<OnboardingGate area="app">` around `<WorkspaceProvider>` around `<AppShell>` (plus `<WorkspaceHeaderTitle>`) for every route in the group |
| `apps/dashboard/src/components/onboarding/onboarding-gate.tsx` | client | Full-screen loader until `user.me` resolves; sends a user who has not onboarded to `/onboarding` ([onboarding.md](onboarding.md)) |
| `apps/dashboard/src/app/(app)/page.tsx` | RSC | `<DashboardPanel title subtitle>` with the message-key defaults |
| `apps/dashboard/src/components/dashboard/dashboard-panel.tsx` | client | `useWorkspace()` → `dashboard.byWorkspace` → `<PageShell wide>` (title / subtitle from the config when set) around loading / error / `<DashboardEmpty>` / `<DashboardGrid>`; mounts `<DashboardHeaderActions>` |
| `apps/dashboard/src/components/dashboard/dashboard-grid.tsx` | pure | `widgets` → `toRows` (engine) → one 12-column grid per row |
| `apps/dashboard/src/components/dashboard/dashboard-widget.tsx` | client | `DashboardWidgetCard`: the `Card` spanning `column`, `useWidgetData` → spinner / "cannot compute" / the renderer picked by an exhaustive `switch` on `type`, plus the footer |
| `apps/dashboard/src/components/dashboard/use-widget-data.ts` | client hook | One `useQuery` per widget under the sheet's own key (`sheetRowsQueryKey`): `fetchAllRows` fetches, `select: runWidget` computes, TanStack memoises — the frontend store of computed data |
| `apps/dashboard/src/components/dashboard/dashboard-empty.tsx` | client | The empty state with the "Create starter dashboard" button → `dashboard.createStarter` |
| `apps/dashboard/src/components/dashboard/dashboard-header-actions.tsx` | client | The Refresh button portalled into the header: invalidates the sheet rows and the config |
| `apps/dashboard/src/components/dashboard/widgets/*.tsx` | client / RSC | One renderer per type: `stat` · `area` · `bar` · `line` · `pie` · `radar` · `radial` (client, recharts) · `heatmap` · `table` (RSC) · `widget-footer`. Each takes a `ResolvedWidget` (config + computed `data`) |
| `apps/dashboard/src/lib/dashboard/widget-state.ts` | pure | `DashboardWidget` / `ResolvedWidget` from `RouterOutputs`, `toWidgetState` (query + engine verdict → one state), `widgetIssueMessageKey` |
| `apps/dashboard/src/lib/dashboard/sheet-rows-query.ts` | pure | The dashboard's cache key for a sheet's rows |
| `apps/dashboard/src/lib/dashboard/layout.ts` | pure | span / height / heatmap class maps, `toChartConfig`, `heatLevel` |
| `apps/dashboard/src/lib/dashboard/format.ts` | pure | `formatFigure` — a figure with its series' prefix / suffix |
| `apps/dashboard/src/lib/spreadsheet/fetch-all-rows.ts` | pure | Walks every `spreadsheet.rows` page into one payload (shared with `/ai-spreadsheet`) |
| `packages/dashboard-engine/` | package | `runWidget`, `validateWidget`, `toRows`, the `WidgetQuery` types — shared with the API ([dashboard.md](../features/dashboard.md)) |
| `apps/dashboard/src/components/layout/app-shell.tsx` | RSC | Page geometry: sidebar beside a column of header + `main`. The only file that knows the layout |
| `apps/dashboard/src/components/layout/app-sidebar.tsx` | client | Collapse state (`useState`, `w-sidebar` ↔ `w-sidebar-rail`), app name + current-plan capsule + collapse toggle, grouped nav, the credits block and account menu at the bottom. Active row from `usePathname()` |
| `apps/dashboard/src/components/layout/sidebar-credits.tsx` | client | Credits usage bar + used/total count above the account block, from the stub in `config/subscription.ts`. Hidden when collapsed |
| `apps/dashboard/src/components/layout/app-header.tsx` | RSC | Takes `title`/`actions` slots as props and mounts the two portal outlets (title left, actions right). Has no interactive element, so it is not a client component |
| `apps/dashboard/src/components/layout/header-actions.tsx` | client | The header's two portal slots: `HeaderActions` (right) and `HeaderTitle` (left), one implementation |
| `apps/dashboard/src/components/workspace/workspace-provider.tsx` | client | `useWorkspace()` — fetches `workspace.list`, resolves the active workspace, persists the choice in localStorage |
| `apps/dashboard/src/components/workspace/account-menu.tsx` | client | The sidebar's bottom block: avatar/name/email trigger (`user.me`) with a menu listing workspaces, "new workspace", a `/settings` link and a UI-only "Log out" |
| `apps/dashboard/src/components/workspace/create-workspace-dialog.tsx` | client | Name form → `workspace.create`; makes the new workspace active |
| `apps/dashboard/src/components/workspace/workspace-header-title.tsx` | client | Portals the active workspace's name into the header title slot |
| `apps/dashboard/src/config/nav.ts` | data | `navSections`, `APP_NAME`. Chrome never hardcodes a link |
| `apps/dashboard/src/config/subscription.ts` | data | Stubbed plan/credits data for the sidebar credits block and `/settings` |
| `apps/dashboard/src/app/layout.tsx` | RSC | Root layout: fonts (`Google_Sans` + `Geist_Mono`), `<html lang>` from `getLocale()`, `NextIntlClientProvider`, `Providers`, `pageMetadata("metadata")`. No chrome |
| `apps/dashboard/src/app/error.tsx` · `global-error.tsx` | client | Error boundaries; both render `components/common/error-fallback.tsx` (English on purpose) |
| `apps/dashboard/src/i18n/config.ts` | data | Locale list, default locale, cookie name |
| `apps/dashboard/src/i18n/request.ts` | server | Resolves the request locale from the cookie and loads its messages |
| `apps/dashboard/src/messages/en.json` | data | Every user-facing string on this page (`dashboard.*`) |
| `apps/dashboard/src/app/providers.tsx` | client | `TRPCReactProvider` + `next-themes` pinned to light via `forcedTheme="light"` |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`, `@reclit/ui/cn`,
`@reclit/ui/focus-ring`, `@reclit/ui/avatar`, `@reclit/ui/dropdown-menu`,
`@reclit/ui/dialog`, `@reclit/ui/progress`, `components/common/page-shell.tsx`,
`components/common/form-field.tsx`, `components/common/loading-state.tsx`,
`components/common/error-state.tsx`, `@reclit/ui/card`, `@reclit/ui/chart`,
`@reclit/ui/table` (+ `recharts`). Icons are `lucide-react`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `dashboard.byWorkspace` | query | `dashboard-panel.tsx`, on load and on workspace switch | — |
| `spreadsheet.rows` | query | `use-widget-data.ts` through `fetchAllRows`, once per sheet (every widget of a sheet shares the entry), under `sheetRowsQueryKey` — **not** the tRPC key the sheet page uses | — |
| `dashboard.createStarter` | mutation | `dashboard-empty.tsx` | `dashboard.byWorkspace` |
| Refresh button | — | `dashboard-header-actions.tsx` | `sheetRowsQueryKey` prefix + `dashboard.byWorkspace` |

Payloads: the contract header of `apps/api/src/__tests__/dashboard.api.test.ts`
(and `spreadsheet.api.test.ts` for `rows`). The layout's `OnboardingGate`
queries `user.me` before anything else mounts; `WorkspaceProvider` queries
`workspace.list`; the account menu queries `user.me` and its create dialog
calls `workspace.create` (invalidating `workspace.list` and
`spreadsheet.list`). `GET /health` is not called here.

## Behaviour

- **First load shows a full-screen loader** (no chrome) while `user.me`
  resolves. With `onboardingCompleted: false` the loader stays up while the
  page redirects to `/onboarding`; otherwise the shell renders. The gate
  wraps the whole `(app)` group, so this holds for every page in it.
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
  `HeaderActions` outlet on the right, where this page puts its Refresh
  button. There is no search field, no notification bell and no header avatar.
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
- **The body is driven entirely by the backend config** (`dashboard.byWorkspace`,
  one dashboard per workspace). Each widget sits in its `row`; widgets in a
  row go left → right by `sort`, each spanning `column` of 12. Every row is
  its own grid, so a row that fills fewer than 12 columns leaves the rest
  empty. Below `lg` every widget is full width. `type` picks the renderer,
  `variant` its style, `height` the chart body (`h-chart-sm/md/lg`).
  Rewriting the config through the API is the whole job — no component edit.
- **No figure is stored.** Each card fetches its sheet (`fetchAllRows`, shared
  with the other cards of that sheet) and derives its own data with
  `runWidget` in a `select`: `groupBy` becomes the x-axis / slices, each
  series' formula the y-axis / KPI, filters narrow the rows. `staleTime: 0`
  and refetch-on-focus mean every visit and every return to the tab re-reads
  the sheet; the Refresh button does it on demand.
- **Per-card states.** A spinner at the chart's height while the sheet loads;
  "the sheet could not be loaded" on a fetch failure; and, when the sheet
  loaded but the widget's query no longer fits it (a referenced column was
  renamed, a formula broke), the engine's first issue as copy — that card
  only, the rest render. The page itself has loading / error / empty states
  around the whole grid.
- **The empty state** (no dashboard, or one with no widgets) offers "Create
  starter dashboard": `dashboard.createStarter` derives a row-count stat, a
  stat per number column, a bar and a monthly line from the first text /
  date columns, and a table of the first columns.
- **The page title and subtitle** come from `en.json` unless the dashboard
  config sets `title` / `description`.
- Widget titles, descriptions, series labels and footers are **data** from
  the config, not `en.json` keys (like workspace names). The chart controls
  in the design (period select, ⋯ menus, month pager, table search) are not
  built; the table's action buttons have no handler yet.
- **Every visible string comes from `src/messages/en.json`** — nav labels and
  section titles included, resolved from the `labelKey`/`titleKey` in
  `config/nav.ts`. `en` is the only locale and there is no switcher.
- **There is no footer.** The shell is sidebar + header only; every destination
  lives in the sidebar.

## Reusable pieces

- `AppShell` — adding a page means adding an entry to `config/nav.ts` and a
  `page.tsx` in the `(app)` group. It never means touching chrome.
- `AppHeader` takes `title` and `actions` slots and mounts the portal outlets
  from `header-actions.tsx`; portal content in (`HeaderTitle` /
  `HeaderActions`) rather than editing the header for one page.
- `useWidgetData` + `sheetRowsQueryKey` — the pattern for any page that
  derives figures from a sheet in the browser: fetch once per sheet, derive
  per consumer in `select`, never throw from the derivation.
- `fetchAllRows` (`lib/spreadsheet/`) — the whole sheet, for any consumer.
- Redesigning the layout is `app-shell.tsx` for geometry, or
  `packages/ui/src/tokens.ts` for the look (colours, radius, control and
  chrome sizes, type scale). If a redesign needs page edits, the shell is
  leaking ([../rules/FRONTEND.md](../rules/FRONTEND.md)).

## Linked routes

- `/onboarding` ([onboarding.md](onboarding.md)) — where the gate sends a user
  who has not onboarded; it sends them back here when they finish.
- `/ai-spreadsheet` ([ai-spreadsheet.md](ai-spreadsheet.md)) — the sheet every
  widget computes from.
- `/settings` ([settings.md](settings.md)) — reached from the account menu.
