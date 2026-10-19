# 032 — Meaningful AI chart recommendations and top-first grid placement

**Status:** implemented
**Scope:** full feature

## Goal

On an empty dashboard the assistant island's right-hand pill reads "AI
Recommendations". One click asks the model for a handful of cards that make
sense for the workspace's sheet — a measure summed per category, a row count
over time, a KPI row — never `SUM({Year})` or `Total ID`. The suggestions
appear in the page body as live preview cards computed from the sheet with
the real renderers, laid out as they will land; each has Add, the set has Add
all and Dismiss. Every new card — from the recommendations, the capsule's
`createWidget` tool or any API caller — takes the first row with room for its
width instead of a new bottom row, so the grid fills top-first.

Decided with the user: previews in the page (not a list under the island);
the island pill is the only entry point (the starter button stays); the model
call is one synchronous tRPC mutation (no run row, no worker).

## Engine (`packages/dashboard-engine`)

- `layout.ts`: `placeWidget(widgets, span, row?)` — the first row (ascending)
  whose spans leave room for `span`, after that row's last card; a new row
  when none fits; a given `row` → after its last card. `placeWidgets(spans)`
  applies it in sequence to an empty grid (the preview layout).
- `profile.ts`: `profileColumns(payload, { topValues? })` over `bindSheet` —
  per column `filled`, `blank`, `distinct`, `topValues`, `numbers?` (min, max,
  sum, average, integers), `dates?` (ISO min/max) and a heuristic `role`:
  `identifier` · `year` · `time` · `flag` · `category` · `measure` · `text` ·
  `other`.

## Backend (Agent 1)

- **Tables:** none.
- **Procedures:** `dashboard.createWidget` accepts `row?` / `sort?` (omitted →
  placed by the service). New `assistant.recommendWidgets` mutation
  `{ workspaceId }` → `{ spreadsheetId; recommendations: AssistantRecommendation[];
  skipped; model; usage }`; errors NOT_FOUND (workspace, sheet),
  SERVICE_UNAVAILABLE (`ASSISTANT_RECOMMENDATIONS_UNAVAILABLE`, no Gemini key
  on the api), BAD_GATEWAY (`ASSISTANT_RECOMMENDATIONS_FAILED`).
- **Service methods:** `DashboardWidgetsService.createWidget` places with the
  engine inside its transaction; `AssistantRecommendService.recommend`
  (prisma-free, generator injectable) — resolve the sheet, load the dashboard
  context, one `generateText` + `Output.object` call with a lenient schema,
  then per card: strict parse → defaults → `validateWidget` → dedupe against
  the dashboard → cap at 6.
- **Prompt:** `loadAssistantContext` reads the first 2,000 rows for the
  dashboard scope and profiles them; the system prompt gains a
  `<column-profile>` block and `CHART_SENSE_RULES`; `buildRecommendationPrompt`
  is the no-tool variant (no tool-loop rules).
- **Reused:** `createSheetResolver`, `readAllRows`, `toWidgetQueryInput`,
  `defaultWidgetSpan`, `validateWidget`, `widgetQuerySchema`, the typed-call
  shape of `cell-output.ts`; `summariseColumn` becomes an adapter over
  `profileColumns`.

## Frontend (Agent 2)

- **Routes:** `/` unchanged.
- **Components:** `use-assistant-run-action.ts` moves to
  `components/assistant/use-page-action.ts` (second consumer);
  `dashboard-widget.tsx` splits into the presentational `widget-card.tsx` and
  the connected card; `dashboard-grid.tsx` takes `renderCard`; new
  `use-dashboard-recommendations.ts`, `dashboard-recommendations.tsx`,
  `dashboard-recommendation-card.tsx`; `dashboard-panel.tsx` publishes the
  pill while the dashboard is empty and no set is open.
- **States:** pill idle / "Thinking…" / error line in the capsule; previews
  per card loading / invalid / ready (the widget card's own states); Add
  pending / failed; empty result copy. Token `island-action` widens for the
  longer label. Messages under `dashboard.recommendations.*`.

## Integration (Agent 3)

- Pill → `assistant.recommendWidgets`; Add → `dashboard.createWidget` (no
  row/sort), Add all sequentially; both invalidate `dashboard.byWorkspace`.
  Previews share the sheet's `sheetRowsQueryKey` fetch with the real cards.

## Decisions

- Synchronous mutation over a Trigger.dev run: nothing to persist, ~5–15 s,
  the local worker adds ~60 s; the api already holds the Gemini key.
- Placement lives in the engine and the dashboard service, not the assistant,
  so every creator fills top-first from one function; `replace` and the
  starter still set rows explicitly.
- Roles are heuristic and advisory: the prompt gets roles, figures and
  rules; `validateWidget` stays a grammar check so nothing legitimate is
  refused.
- Lenient generation schema, strict per-card validation: the Google provider
  drops `pattern` / `maxItems` from response schemas, so a strict
  `Output.object` would lose the whole response on one bad series key.
- The recommendation set is component state: a transient proposal, gone on
  reload; previews derive in `select` like every card, nothing stored.
- Empty dashboard only (as asked). Not built: an entry point below `md`
  (the island is hidden there), "suggest more" on a non-empty dashboard, a
  role-aware starter.

## Risks / open questions

- Gemini's response schema with the flat filter unions: the same conversion
  path the working tool declarations use, but not executed before this plan —
  one smoke call during implementation.
- The role heuristics misread an unusual sheet (a dense integer measure read
  as an identifier); the rules are advisory and the user picks the cards.
- First `ai`-SDK import reachable from `src/modules/**`; the dashboard imports
  the api type-only, confirmed by `bun run build:dashboard`.

---

## Outcome

- **Shipped (engine):** `placeWidget` / `placeWidgets` in `layout.ts`,
  `profile.ts` (`profileColumns`, `ColumnProfile`, `ColumnRole`), both
  exported; `tests/layout.test.ts` + `tests/profile.test.ts` (92 engine
  tests green).
- **Shipped (api):** `createWidgetInput` with `row?` / `sort?` and the
  placement inside `DashboardWidgetsService.createWidget`; the assistant's
  `createWidget` tool passes the slot through and finds the new card by id;
  `loadAssistantContext({ workspaceId, scope, sheetId })` reads 2,000 rows
  for the dashboard scope and profiles them, `toPromptContext(scope, …)`,
  `readAllRows(sheetId, maxRows?)`; `assistant-prompt.ts` with
  `<column-profile>`, `CHART_SENSE_RULES`, a shared data-block helper and
  `buildRecommendationPrompt`; `summariseColumn` over `profileColumns`
  (+ `distinct`, `role`); `ai/assistant-recommend.ts`,
  `assistant-recommend.service.ts`, the two errors, the schemas
  (`MAX_RECOMMENDATIONS`, `assistantRecommendationSchema`,
  `assistantRecommendationsSchema`, `recommendWidgetsInput`) and
  `assistant.recommendWidgets`. Contracts: `dashboard.api.test.ts`
  (placement cases) and `assistant.api.test.ts` (profile block, recommendation
  prompt, the procedure through a fake generator) green.
- **Shipped (dashboard):** `components/assistant/use-page-action.ts`
  (`useAssistantPageAction`, moved from the sheet); `WidgetView`,
  `WidgetSource`, `AssistantRecommendation(s)` in `widget-state.ts`;
  `widget-card.tsx` (the frame) + the thin `dashboard-widget.tsx`;
  `dashboard-grid.tsx` with `renderCard`; `use-dashboard-recommendations.ts`,
  `dashboard-recommendations.tsx`, `dashboard-recommendation-card.tsx`;
  `dashboard-panel.tsx` publishes the pill and places the set;
  `dashboard.recommendations.*` messages; `island-action` 15rem → 19rem.
- **Verified:** lint, typecheck, engine / api / dashboard tests, the
  production dashboard build; in the browser on a 90-row sheet with
  identifier, year, category, measure and date columns — the pill, "Thinking…",
  six cards (four stats, revenue by region, revenue over time grouped by the
  date column's year — nothing aggregated the Year or Order ID columns),
  Add → row 0 sort 0, Add all → the rest at (0,1) (0,2) (0,3) (1,0) (1,1),
  the set closing on the last add, Dismiss restoring the empty state, the
  sheet page unaffected; no console errors. Gemini accepted the response
  schema on the first call.
- **Deviated:** the pill is published from `dashboard-panel.tsx`, not the
  empty state (no remount dance after the first Add); the previews reuse
  `DashboardGrid` through a `renderCard` prop instead of a second grid; the
  prompt test asserts on the closing tag because the untrusted-data rule names
  `<column-profile>` in every scope; `"total"` is a reserved series key, so the
  fixtures use `"sum"`.
- **Not verified here:** the capsule's tool-loop path in the browser (the
  Trigger.dev worker runs under the user's profile — the executor contract
  covers the new placement), and the SERVICE_UNAVAILABLE line in the capsule
  (the api was started with the key; the contract covers the code, the hook
  maps it to `recommendations.unavailable`).
- **Not done:** an entry point below `md`, "suggest more" on a non-empty
  dashboard, a role-aware starter dashboard.
- **Docs updated:** `docs/features/assistant.md`, `docs/features/dashboard.md`,
  `docs/routes/root.md`, `docs/routes/ai-spreadsheet.md`, `ARCHITECTURE.md`
  (env table), `docs/SECURITY.md`, `apps/api/.env.example`.
