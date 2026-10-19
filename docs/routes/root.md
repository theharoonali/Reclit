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
| `apps/dashboard/src/app/(app)/layout.tsx` | RSC | The **one** chrome mount point — renders `<OnboardingGate area="app">` around `<WorkspaceProvider>` around `<AssistantProvider>` around `<AppShell>` (plus `<WorkspaceHeaderTitle>` and `<AssistantIsland>`) for every route in the group |
| `apps/dashboard/src/components/onboarding/onboarding-gate.tsx` | client | Full-screen loader until `user.me` resolves; sends a user who has not onboarded to `/onboarding` ([onboarding.md](onboarding.md)) |
| `apps/dashboard/src/app/(app)/page.tsx` | RSC | `<DashboardPanel />` |
| `apps/dashboard/src/components/dashboard/dashboard-panel.tsx` | client | `useWorkspace()` → `dashboard.byWorkspace` → `<PageShell wide>` (title / subtitle from the config when set) around loading / error / `<DashboardEmpty>` / `<DashboardGrid>` (+ `<DashboardRecommendations>` while a set is open); owns `useDashboardRecommendations` and publishes the "AI Recommendations" pill (`useAssistantPageAction`) while the dashboard is empty and no set is open; mounts `<DashboardHeaderActions>` |
| `apps/dashboard/src/components/dashboard/dashboard-grid.tsx` | pure | `widgets` → `toRows` (engine) → one 12-column grid per row; `renderCard` draws each item (stored or proposed) |
| `apps/dashboard/src/components/dashboard/widget-card.tsx` | client | `WidgetCard`: the frame every card renders in — a `Card` spanning `column`, spinner / "cannot compute" / the renderer picked by an exhaustive `switch` on `type`, the footer, and an optional trailing `action` |
| `apps/dashboard/src/components/dashboard/dashboard-widget.tsx` | client | `DashboardWidgetCard`: a stored widget — `useWidgetData` + `WidgetCard` |
| `apps/dashboard/src/components/dashboard/use-widget-data.ts` | client hook | One `useQuery` per widget (stored or proposed) under the sheet's own key (`sheetRowsQueryKey`): `fetchAllRows` fetches, `select: runWidget` computes, TanStack memoises — the frontend store of computed data |
| `apps/dashboard/src/components/dashboard/use-dashboard-recommendations.ts` | client hook | The recommendation flow: `assistant.recommendWidgets` → the proposed cards in component state; `add` / `addAll` (sequential) → `dashboard.createWidget` without a slot, invalidating `dashboard.byWorkspace`; `dismiss`; the pill's `errorMessage` from the tRPC code |
| `apps/dashboard/src/components/dashboard/dashboard-recommendations.tsx` | client | The proposed cards laid out as they will land (the engine's `placeWidgets`) through `DashboardGrid`, with Add all / Dismiss above and the empty copy when the model found nothing |
| `apps/dashboard/src/components/dashboard/dashboard-recommendation-card.tsx` | client | A proposed card: `useWidgetData` over `{ spreadsheetId, type, variant, query }` + `WidgetCard` with Add in its footer |
| `apps/dashboard/src/components/assistant/use-page-action.ts` | client hook | `useAssistantPageAction` — publishes a page's action as the capsule's right-hand pill, withdrawn on `null` and unmount (shared with [`/ai-spreadsheet`](ai-spreadsheet.md)) |
| `apps/dashboard/src/components/dashboard/dashboard-empty.tsx` | client | The empty state with the "Create starter dashboard" button → `dashboard.createStarter` |
| `apps/dashboard/src/components/dashboard/dashboard-header-actions.tsx` | client | "AI is filling N cells…" portalled into the header while runs are working (`fillingCount`); nothing otherwise — there is no Refresh control, the figures refresh on their own |
| `apps/dashboard/src/components/dashboard/use-dashboard-live-rows.ts` | client hook | `useDashboardLiveRows(sheetId)`: `runAi.listActive` on load; while anything is working, the `runAi.onChange` stream, and every completed run refetches the sheet rows (debounced 1 s) — how the dashboard fills after onboarding's Run AI |
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
| `apps/dashboard/src/components/layout/app-header.tsx` | RSC | Takes `title`/`actions` slots as props and mounts the three portal outlets (title left, centre laid over the bar, actions right). `relative` for the centre outlet. Has no interactive element, so it is not a client component |
| `apps/dashboard/src/components/layout/header-actions.tsx` | client | The header's three portal slots: `HeaderActions` (right), `HeaderTitle` (left) and `HeaderCenter` (absolutely centred, `pointer-events-none` outlet, hidden below `md`), one implementation |
| `apps/dashboard/src/components/assistant/assistant-provider.tsx` | client | `useAssistant()` — the assistant run for the app (`run`, `lastTerminal`, `isSubmitting`, `errorKey`, `start` / `cancel` / `respond` / `dismiss`), the scope from `scopeForPath(usePathname())`, and `registerPage(scope, { beforeStart?, refresh })` for a page's handlers; invalidates the dashboard's caches after a run's changes |
| `…/use-assistant-run.ts` | client hook | The run layer: `assistant.active` on load (`staleTime: 0`), the `assistant.onChange` subscription while a run is alive (newer row wins; `closed` ends it), `assistant.start` (subscribes first) / `cancel` / `respond`, tRPC code → `errorKey` |
| `apps/dashboard/src/components/assistant/assistant-island.tsx` | client | The capsule: a `<form>` portalled into `HeaderCenter`, `islandMode` from the run and the field (draft, hover, focus, voice), width `w-island-closed` / `w-island` / `w-island-wide`, Enter submits, Escape collapses an empty field; the orb, then one of the pieces below |
| `…/assistant-composer.tsx` · `assistant-stage.tsx` · `assistant-confirm.tsx` · `assistant-result.tsx` · `assistant-run-action.tsx` | client | The pill `Input` with mic / Stop / Send (arrow right) / spinner inside its right end · the stage line (`aria-live`) + cancel × · the question + circular check / cross (disabled once answered) · the done / failed / cancelled, error or page-refusal line + dismiss · the page's action pill (the sheet's Run AI: outlined in the primary colour, the count in its tooltip, "Starting…" while busy) |
| `…/assistant-orb.tsx` | client | The animated orb: a `size-orb` canvas (`useCanvasSurface` + `requestAnimationFrame`) of two filled wave ribbons (blue and red) on a dark disc with a rotating colour sweep, drifting gloss and a white sheen, clipped to a circle with a gradient rim. `state` sets the tempo (idle is the design speed), paused when the tab is hidden or motion is reduced (still frame) |
| `…/use-voice-input.ts` | hook | `MediaRecorder` (`audio/webm;codecs=opus`, else `audio/mp4`), 60 s auto-stop, 10 MB guard → `transcribeAudio`; hands the text to the caller, never sends it |
| `…/use-run-lifecycle.ts` | hook | Around any run: refresh the page after a mutating step (debounced 500 ms) and at the end; auto-dismiss done after 8 s, cancelled after 4 s, failed never |
| `apps/dashboard/src/lib/assistant/*.ts` | pure | `types.ts` (the pinned wire shapes), `island-state.ts` (`islandMode`, `islandWidthClass`, the status predicates), `step-label.ts` (`stepLabel` / `confirmLabel` → `{ key, values }` for `t`), `transcribe.ts` (`POST /assistant/transcribe`) |
| `apps/dashboard/src/config/assistant.ts` | data | `scopeForPath` (`/` → `dashboard`, `/ai-spreadsheet` → `spreadsheet`, else hidden), the prompt cap, result timings, voice limits |
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
| `apps/dashboard/src/messages/en.json` | data | Every user-facing string on this page (`dashboard.*`, `assistant.*`) |
| `apps/dashboard/src/app/providers.tsx` | client | `TRPCReactProvider` + `next-themes` pinned to light via `forcedTheme="light"` |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`, `@reclit/ui/cn`,
`@reclit/ui/focus-ring`, `@reclit/ui/avatar`, `@reclit/ui/dropdown-menu`,
`@reclit/ui/dialog`, `@reclit/ui/progress`, `components/common/page-shell.tsx`,
`components/common/form-field.tsx`, `components/common/loading-state.tsx`,
`components/common/error-state.tsx`, `@reclit/ui/card`, `@reclit/ui/chart`,
`@reclit/ui/table` (+ `recharts`), `@reclit/ui/spinner`, the `island` tokens
and the `pill` `Input` / `island` + `island-outline` + `island-plain` `Button` variants. Icons are `lucide-react`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `dashboard.byWorkspace` | query | `dashboard-panel.tsx`, on load and on workspace switch | — |
| `spreadsheet.rows` | query | `use-widget-data.ts` through `fetchAllRows`, once per sheet (every widget of a sheet shares the entry), under `sheetRowsQueryKey` — **not** the tRPC key the sheet page uses | — |
| `dashboard.createStarter` | mutation | `dashboard-empty.tsx` | `dashboard.byWorkspace` |
| `assistant.recommendWidgets` | mutation | `use-dashboard-recommendations.ts`, from the capsule's "AI Recommendations" pill | — (the cards stay in component state) |
| `dashboard.createWidget` | mutation | `use-dashboard-recommendations.ts`, Add / Add all (no `row` / `sort`: the api places the card) | `dashboard.byWorkspace` |
| `runAi.listActive` | query | `use-dashboard-live-rows.ts`, on load, on focus and every 15 s while no stream is open (`staleTime: 0`) | — (set to `[]` on `closed`) |
| `runAi.onChange` | subscription (SSE) | `use-dashboard-live-rows.ts`, while the sheet has working runs | `sheetRowsQueryKey(sheetId)` after each completed run (debounced) and on `closed` |

The assistant island (shared with [`/ai-spreadsheet`](ai-spreadsheet.md);
plan [030](../plans/030-assistant-island.md); feature
[assistant.md](../features/assistant.md)):

| Procedure / endpoint | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `assistant.start` | mutation | `use-assistant-run.ts` (`start`, after the page's `beforeStart`) | — |
| `assistant.active` | query | `use-assistant-run.ts`, on load (`staleTime: 0`) | — (set to null on `closed` / dismiss) |
| `assistant.onChange` | subscription (SSE) | `use-assistant-run.ts`, while a run is alive | — |
| `assistant.cancel` · `assistant.respond` | mutation | the stage's × · the confirmation's check / cross | — |
| `POST /assistant/transcribe` | REST, multipart | `use-voice-input.ts` through `lib/assistant/transcribe.ts` | — |
| Refresh | — | `use-run-lifecycle.ts` after a mutating step (debounced 500 ms) and at the end of a run | `dashboard.byWorkspace` + `sheetRowsQueryKey` prefix, always; plus the run's page handler (the sheet's `use-assistant-refresh.ts`) |

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
- `Dashboard`, `AI Spreadsheet` and `Populate` are real destinations.
  `Chat` is listed and locked (no route yet). `/settings` is reached from
  the account menu (there is no pinned Settings nav row).
- The active row is derived from `usePathname()` and marked `aria-current="page"`.
- **Light only.** `providers.tsx` passes `forcedTheme="light"`, so the `.dark`
  tokens in `@reclit/ui` can never apply and there is no theme control in the
  UI. Removing that one prop restores dark mode.
- Below the `md` breakpoint the sidebar is hidden entirely. **There is no mobile
  navigation** — that needs a `Sheet` primitive and `@radix-ui/react-dialog`.
- The header is empty chrome plus its slots: the `HeaderTitle` outlet on the
  left (the active workspace's name, hidden below `lg`), the `HeaderCenter`
  outlet laid over the bar (the assistant island), and `actions` +
  `HeaderActions` outlet on the right, where this page puts its "AI is
  filling…" line while runs work. There is no search field, no notification
  bell, no header avatar and no Refresh button.
- **The assistant island** sits centred in the header (`md` and up). At
  rest it is the orb and a short "Reclit AI" label, centred in a
  `w-island-closed` capsule (`w-island-action` with the page's action pill
  beside it — this page's "AI Recommendations" while the dashboard is
  empty); hovering, focusing or clicking it widens the
  capsule to
  `w-island` and the same pill grows into the field, the mic fading in
  inside its right end (hidden where the browser cannot record; a right
  arrow sends once there is text, Enter sends; Escape collapses an empty
  field). The mic records up to 60 s, Stop (or the limit) sends the
  audio to be transcribed and puts the text in the field — never sends it.
  A run widens the capsule to `w-island-wide` and streams its stage —
  Queued, Thinking, "Working: <step>" formatted from the server's tool and
  summarised input — with a cancel ×; a delete pauses it on a question with
  a circular green check (light success tint, confirm) and red cross (light
  destructive tint, keep), both disabled once answered. The end of a run is one line:
  the summary (gone after 8 s), "The run failed." (until dismissed) or
  "Cancelled" (4 s). A refusal (busy, dispatch) or a mic / transcription
  problem shows as an error line in the open capsule with a dismiss ×. The
  orb plays at its design tempo when idle and speeds up while listening or running; it stops
  with a hidden tab or reduced motion.
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
  the sheet, and the live stream below re-reads it as AI runs complete.
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
- **AI Recommendations.** While the dashboard is empty the assistant island's
  right-hand pill reads "AI Recommendations" (`md` and up — the island is
  hidden below). One click asks `assistant.recommendWidgets` ("Thinking…" in
  the pill, ~5–15 s; a refusal shows in the capsule as an error line) and the
  empty state gives way to "Recommended charts": up to six proposed cards,
  each computed live from the sheet with the real renderers and laid out as
  they will land (the engine's `placeWidgets`, the rule the api applies on
  Add). Add puts one card on the dashboard through `dashboard.createWidget`
  without a slot — the api takes the first row with room for its width —
  and removes it from the set; Add all does that one card at a time; Dismiss
  drops the set. Once the first card is added the real grid shows above the
  remaining proposals; when the last one is added the set closes. The set is
  component state and does not survive a reload. A sheet the model finds
  nothing meaningful in gets the empty copy and Dismiss.
- **The figures keep moving while the AI fills the sheet.** When the page
  opens with runs working (the onboarding wizard's Run AI lands here with a
  batch in flight), the header shows "AI is filling N cells…" and every
  completed run refetches the sheet rows, so each card recomputes
  as the values arrive; the server closes the stream when the last run
  finishes. A batch started elsewhere (the sheet page, the assistant) is
  picked up too: the page re-asks `runAi.listActive` on focus and every 15 s
  while idle.
- **Every new card fills the grid top-first.** Whatever creates it — the
  recommendations' Add, the capsule's `createWidget` tool, an API caller
  leaving `row` / `sort` out — the api places it in the first row with room
  for its width, after that row's last card, and only otherwise on a new row.
- **The page has no heading of its own.** A title and subtitle show only
  when the dashboard config sets `title` / `description`.
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
  `HeaderCenter` / `HeaderActions`) rather than editing the header for one
  page.
- `registerPage(scope, { beforeStart?, refresh })` from `useAssistant()` —
  how a page tells the assistant what to do before a run (the sheet flushes
  its edits) and how to show its changes.
- `islandMode` + `islandWidthClass` (`lib/assistant/island-state.ts`) — the
  one state machine behind the capsule; `stepLabel` / `confirmLabel` — the
  server's identifiers to copy.
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
