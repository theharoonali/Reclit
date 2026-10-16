# 029 — Backend-configured dashboard with spreadsheet-sourced charts

**Status:** implemented
**Scope:** full feature

## Goal

The dashboard on `/` is described entirely by the backend. A future LLM (or
any API caller) writes the config — widget type and variant, grid placement,
the x-axis column, the y-axis formulas, KPIs — and the page renders it. No
data is stored for the dashboard: the frontend reads the workspace's sheet
through `spreadsheet.rows`, computes every widget in the browser with the
formula/query engine, and keeps the results in the query cache. Plan 028's
JSON file and its resolved `data` go away; the nine renderers stay.

Decided with the user: one dashboard per workspace; an empty workspace gets
a "Create starter dashboard" button; freshness is refetch-on-focus plus a
Refresh button; the engine is a shared package so the API validates formulas
and column references on write.

## Engine (`packages/dashboard-engine`, `@reclit/dashboard-engine`)

- Pure TypeScript, no runtime deps, compiled inside both consumers (the API's
  tsconfig has `verbatimModuleSyntax` and no DOM lib — `import type`, UTC
  only).
- `widget.ts` — the vocabularies (`WIDGET_TYPES`, `WIDGET_VARIANTS`,
  `CHART_COLORS`, `FILTER_OPS`, `BUCKETS`, `SERIES_KEY_RE`) and the types:
  `WidgetQuery` (`filters`, `groupBy`, `splitBy`, `series[]` with a
  `formula`, `sort`, `limit`, `compare`, `footer`), `WidgetData` (the old
  `data` shape), `QueryIssue`, `WidgetResult`.
- `formula/` — tokenizer, parser (`parseFormula` → `{ ast, columns,
  isAggregate }`), evaluator (`evaluateRow`, `evaluateAggregate`). Grammar:
  `{Column}` refs, literals, `+ - * / %`, comparisons, `AND OR NOT`, row
  functions `IF ABS ROUND FLOOR CEIL COALESCE LEN LOWER UPPER TRIM`,
  aggregates `SUM AVG MIN MAX COUNT COUNT_DISTINCT FIRST LAST` (not
  nestable; no bare ref beside an aggregate).
- `query/` — `applyFilters`, `partition` (grouping + date buckets),
  `runWidget(spec, payload) → WidgetResult` (never throws).
- `validate.ts` — `validateWidget(spec, columns)`: the one copy of every
  semantic rule (variant per type, groupBy required/forbidden, series
  counts, aggregate vs row-level, bucket only on dates, sort/detail keys,
  unknown columns, formula errors).
- `layout.ts` — `toRows`, `checkLayout` (duplicate `row:sort`, row over 12).
- Pie/radial slices get minted keys (`k0`, `k1`, …) with the category text
  as `label`, because `chart.tsx` turns series keys into CSS variable names.

## Backend (Agent 1)

- **Tables:** `Dashboard` (`workspaceId` unique, nullable `title` and
  `description`) and `DashboardWidget` (`dashboardId`, `spreadsheetId`,
  `name`, `description`, `type` enum, `variant`, `row`, `column`, `sort`,
  `height` enum, `query Json`); both cascade from their parents.
- **Procedures** (`dashboard` router): `byWorkspace` (query, `DashboardDetail
  | null`), `replace` (atomic full replace, creates lazily), `update`
  (title/description), `remove`, `createWidget`, `updateWidget`,
  `removeWidget`, `createStarter`. Widget mutations return the whole
  `DashboardDetail`. Errors: `DASHBOARD_NOT_FOUND`,
  `DASHBOARD_WIDGET_NOT_FOUND`, `DASHBOARD_LAYOUT_INVALID`,
  `DASHBOARD_UNKNOWN_COLUMN`, `DASHBOARD_FORMULA_INVALID`,
  `DASHBOARD_QUERY_INVALID`, `DASHBOARD_SPREADSHEET_MISMATCH`,
  `DASHBOARD_NOT_EMPTY`; `WORKSPACE_NOT_FOUND` and `SPREADSHEET_NOT_FOUND`
  reused.
- **Service methods:** `DashboardService.byWorkspace / replace / update /
  remove / createStarter`, `DashboardWidgetsService.createWidget /
  updateWidget / removeWidget`; `dashboard-validate.ts` resolves the sheet
  (default: the workspace's), reads its columns through
  `spreadsheetService.columnsOf`, runs `validateWidget` + `checkLayout`;
  `dashboard-starter.ts` builds the starter widgets from the columns.
- Reused: `idInput`, `mapDomainError`, `toJsonInput`, `isRecordNotFound`,
  `workspaceService.byId`, `spreadsheetService.columnsOf`,
  `toWireColumnType`.

## Frontend (Agent 2)

- **Route:** `/` unchanged (nav entry exists), now `force-dynamic`.
- **Components:** `components/dashboard/dashboard-panel.tsx` (workspace →
  `dashboard.byWorkspace` → states), `dashboard-grid.tsx` (pure),
  `dashboard-widget.tsx` (`DashboardWidgetCard`: card frame +
  `useWidgetData`), `dashboard-empty.tsx` (starter button),
  `dashboard-header-actions.tsx` (Refresh), `use-widget-data.ts`;
  `widgets/*` keep their bodies and change a type import.
- **Data:** `lib/spreadsheet/fetch-all-rows.ts` (moved from
  `lib/ai-spreadsheet/`), `lib/dashboard/sheet-rows-query.ts` (the
  dashboard's own cache key — never the sheet page's, whose `gcTime: 0`
  invariant must survive), `lib/dashboard/widget-state.ts`.
- **States:** page loading / error / empty; per-card loading, invalid
  (unknown column, bad formula) and ready.
- `dummy-data/` is deleted.

## Integration (Agent 3)

- `DashboardPanel` → `dashboard.byWorkspace`; `DashboardWidgetCard` →
  `spreadsheet.rows` via `fetchAllRows` under `sheetRowsQueryKey` with
  `select: runWidget` (one fetch per sheet, per-widget derivation memoised);
  `DashboardEmpty` → `dashboard.createStarter`, invalidates
  `dashboard.byWorkspace`; Refresh invalidates both.

## Decisions

- Column references by **name** (`{Revenue}`), not `col.N`: it is what an
  LLM sees. A rename shows an unknown-column state in that card only.
- One formula language for KPIs and axes instead of a column + aggregate
  picker: one path, strictly more expressive.
- Semantic rules live once (`validateWidget`); zod stays structural.
- Engine output = plan 028's `data` shape, so the renderers survive.
- Own cache key for the dashboard's rows (TanStack keeps the max `gcTime`
  across observers; sharing the sheet page's key would make its cached
  payload outlive the grid).
- `runWidget` returns a result rather than throwing: a throwing `select`
  would trigger `retry: 2` and refetch the whole sheet per broken widget.
- No currency/percent `format`; `decimals` + `prefix`/`suffix` keep chart
  values numeric.
- One dashboard per workspace, widget mutations return `DashboardDetail`.

## Risks / open questions

- A 20k-row sheet is 40 `spreadsheet.rows` calls per load (same as the
  sheet page). A columnar bulk read is the follow-up if it hurts.
- Live push (trigger + LISTEN + `spreadsheet.onChange`) is a follow-up; the
  run-ai feed is the pattern.
- The LLM tool layer is the next feature; the contract header is its spec.

---

## Outcome

- **Shipped:**
  - **`packages/dashboard-engine`** (`@reclit/dashboard-engine`): `widget.ts`
    (vocabularies + `WidgetQuery` / `WidgetData` / `WidgetResult`),
    `sheet.ts` (`bindSheet`), `bucket.ts`, `formula/` (tokens, parser,
    evaluator, functions, values), `query/` (`applyFilters`, `partition`,
    `runWidget`), `validate.ts` (`validateWidget`), `layout.ts` (`toRows`,
    `checkLayout`). 81 tests in `packages/dashboard-engine/tests/`.
  - **Backend:** `Dashboard` + `DashboardWidget` tables (migration
    `20261015211411_add_dashboard`), `apps/api/src/modules/dashboard/`
    (schema, errors, shape, `dashboard-validate.ts`, `dashboard-starter.ts`,
    two services), the `dashboard` router with eight procedures, the
    contract `apps/api/src/__tests__/dashboard.api.test.ts` (24 tests).
  - **Frontend:** `components/dashboard/{dashboard-panel,dashboard-grid,
    dashboard-widget,dashboard-empty,dashboard-header-actions}.tsx`,
    `use-widget-data.ts`; `lib/dashboard/{widget-state,sheet-rows-query,
    format,layout}.ts`; `lib/spreadsheet/fetch-all-rows.ts` (moved);
    `widgets/*` take a `ResolvedWidget`; `/` is `force-dynamic`; the
    `dashboard.*` message keys. Tests in `apps/dashboard/tests/dashboard/`.
  - Verified in the browser: the starter button fills an empty workspace; a
    ten-widget `dashboard.replace` (stats with `compare`, prefix and suffix,
    a month-bucketed bar, a pie with real region labels, a seller pivot
    line, a margin-sorted table with person cells, a radial percentage, a
    stacked area pivot) renders with no console errors; renaming a referenced
    column turns only the dependent cards into the unknown-column state
    after Refresh, with one `spreadsheet.rows` request per sheet.
- **Deviated:**
  - **Stat output keeps every series** (headline included) so the renderer
    can apply the headline's `prefix` / `suffix`; `StatWidget` lists the
    others beside it. The plan had the headline dropped from `series`.
  - **`heatLevel` is relative to the widget's largest value**, not fixed to
    0–100, so any measure fills the heatmap's scale.
  - **Charts hide fractional y-axis ticks** (`allowDecimals={false}`) —
    counts of 1 were drawing 0.25 steps.
  - **The engine's tsconfig is `ESNext` + `Bundler`**, not `packages/ui`'s
    `NodeNext`: with `verbatimModuleSyntax` and no `"type": "module"`,
    NodeNext treated the files as CommonJS.
  - **`createStarter` fails CONFLICT when widgets exist** (the plan left it
    open); `replace` is the overwrite path.
  - Extra engine issue codes beyond the plan's list: `SPLIT_BY_FORBIDDEN`,
    `SERIES_KEY`, `COMPARE_FORBIDDEN`; the API maps all but the column and
    formula ones to `DASHBOARD_QUERY_INVALID`.
- **Not done:**
  - No UI writes the config beyond the starter — `replace`, `update`,
    `createWidget`, `updateWidget`, `removeWidget` are the LLM's surface.
  - No live push: freshness is refetch-on-focus plus Refresh.
  - `spreadsheet.rows` is still paged at 500; a bulk columnar read is the
    follow-up if large sheets make the dashboard slow.
  - Currency / percent *formatting* is `prefix` / `suffix` + `decimals`; no
    locale-aware number formats.
- **Docs updated:** `docs/features/dashboard.md` (+ index row, "Used by" in
  `spreadsheet.md` and `workspace.md`), `docs/routes/root.md` (+ index row,
  `ai-spreadsheet.md` for the moved file), `docs/rules/FRONTEND.md`,
  `ARCHITECTURE.md`, `AGENTS.md`.
