# `dashboard`

**Purpose:** one backend-configured dashboard per workspace — widget types,
grid placement, x-axis columns and y-axis formulas — so an LLM or any API
caller can rebuild the `/` page by writing config. Nothing computed is
stored: the browser reads the sheet and runs every widget.

**Contract:** `apps/api/src/__tests__/dashboard.api.test.ts` — payloads,
responses, the query shape, the formula grammar, the per-type rules and every
error code live in its header. Do not duplicate them here.

## Columns on `Workspace`

The dashboard is not a table of its own: one per workspace, stored on the
workspace row ([workspace.md](workspace.md)). On the wire `DashboardDetail`
keeps its own shape — its `id` (and each widget's `dashboardId`) is the
workspace id, `createdAt` is `dashboardCreatedAt`, `updatedAt` the
workspace's.

| Column | Type | Notes |
| --- | --- | --- |
| `dashboardCreatedAt` | `DateTime?` | null = the workspace has no dashboard (`byWorkspace` answers null); set by the first widget write, cleared by `remove` |
| `dashboardTitle` | `String?` | null → the page's default title |
| `dashboardDescription` | `String?` | null → the page's default subtitle |

## Table `DashboardWidget`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `workspaceId` | `String` | fk cascade → `Workspace`; `dashboardId` on the wire |
| `spreadsheetId` | `String` | fk cascade → `Spreadsheet`, indexed — the sheet the widget reads |
| `name` | `String` | the card title (data, not a message key) |
| `description` | `String?` | the card subtitle |
| `type` | `DashboardWidgetType` | `STAT AREA BAR LINE PIE RADAR RADIAL HEATMAP TABLE`; lowercase on the wire |
| `variant` | `String` | default `"default"`; the engine's `WIDGET_VARIANTS` lists each type's |
| `row`, `column`, `sort` | `Int` | placement: the row, the span (1..12), the order within the row |
| `height` | `DashboardWidgetHeight` | `SM MD LG`, default `MD`; the chart body's height |
| `query` | `Json` | a `WidgetQuery` (`@reclit/dashboard-engine`): filters, groupBy, splitBy, series formulas, sort, limit, compare, footer |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: `DashboardWidget(workspaceId, row, sort)`,
`DashboardWidget.spreadsheetId` · Relations: `Workspace.dashboardWidgets[]`,
`Spreadsheet.dashboardWidgets[]` · Migrations:
`apps/api/prisma/migrations/20261015211411_add_dashboard/`,
`apps/api/prisma/migrations/20261103180000_consolidate_tables/` (the
dashboard folded into `Workspace`).

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `packages/dashboard-engine/` | engine | `WidgetQuery` + the vocabularies, the formula parser/evaluator, `validateWidget` (every semantic rule), `checkLayout`, `placeWidget` / `placeWidgets` (top-first placement), `profileColumns` (fill, cardinality, ranges and a heuristic role per column), `runWidget` (browser side) — shared with the dashboard app |
| `apps/api/prisma/schema.prisma` | model | the `Workspace` dashboard columns, `DashboardWidget`, the two enums |
| `apps/api/src/modules/dashboard/dashboard.schema.ts` | schema | zod inputs/outputs (structural), wire ↔ db enum mirrors, `toWidgetQuery` (the typecheck tie to the engine type) |
| `apps/api/src/modules/dashboard/dashboard.errors.ts` | errors | the eight `Dashboard*Error`s, `formatPath` |
| `apps/api/src/modules/dashboard/dashboard.shape.ts` | shape | the selects (`dashboardSelect` is a `Workspace` select), `toDashboardWidget` (`workspaceId` → `dashboardId`) / `toDashboardDetail` (null while `dashboardCreatedAt` is null) |
| `apps/api/src/modules/dashboard/dashboard-validate.ts` | pure + reads | `createSheetResolver` (sheet default + ownership + columns, cached per id), `assertWidgetValid` (engine issue → domain error), `assertLayoutValid`, `prepareWidgets` |
| `apps/api/src/modules/dashboard/dashboard-starter.ts` | pure | `buildStarterWidgets(columns)` |
| `apps/api/src/modules/dashboard/dashboard.service.ts` | service | `byWorkspace`, `byId` (by the workspace id), `replace`, `update`, `remove`, `createStarter`; `ensureDashboard(tx, workspaceId)` (sets `dashboardCreatedAt` when null), `written` |
| `apps/api/src/modules/dashboard/dashboard-widgets.service.ts` | service | `createWidget`, `updateWidget`, `removeWidget` |
| `apps/api/src/trpc/routers/dashboard.ts` | router | thin delegation |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `dashboard.byWorkspace` | query | `DashboardService.byWorkspace` | `WORKSPACE_NOT_FOUND` |
| `dashboard.replace` | mutation | `DashboardService.replace` | `WORKSPACE_NOT_FOUND`, `SPREADSHEET_NOT_FOUND`, `DASHBOARD_SPREADSHEET_MISMATCH`, `DASHBOARD_UNKNOWN_COLUMN`, `DASHBOARD_FORMULA_INVALID`, `DASHBOARD_QUERY_INVALID`, `DASHBOARD_LAYOUT_INVALID`, validation |
| `dashboard.update` | mutation | `DashboardService.update` | `DASHBOARD_NOT_FOUND`, validation |
| `dashboard.remove` | mutation | `DashboardService.remove` | `DASHBOARD_NOT_FOUND` |
| `dashboard.createWidget` | mutation | `DashboardWidgetsService.createWidget` | as `replace` |
| `dashboard.updateWidget` | mutation | `DashboardWidgetsService.updateWidget` | `DASHBOARD_WIDGET_NOT_FOUND` + as `replace` |
| `dashboard.removeWidget` | mutation | `DashboardWidgetsService.removeWidget` | `DASHBOARD_WIDGET_NOT_FOUND` |
| `dashboard.createStarter` | mutation | `DashboardService.createStarter` | `WORKSPACE_NOT_FOUND`, `SPREADSHEET_NOT_FOUND`, `DASHBOARD_NOT_EMPTY` |

## Behaviour

- **One rule set, two runtimes.** The API never computes a figure. It
  validates each widget with the engine's `validateWidget` against the
  sheet's columns (`spreadsheetService.columnsOf`, wire types via
  `toWireColumnType`) and maps the first issue to a domain error whose
  message names the path (`widgets[2].query.series[0].formula`). The browser
  runs the same function before `runWidget`, so a column renamed after the
  widget was written is an issue in that card, never a crash.
- **`replace` is validate-then-swap.** `prepareWidgets` resolves and
  validates every widget (reading each sheet once), checks the layout, and
  only then one transaction creates the dashboard if needed, writes the
  title / description, deletes the old widgets and `createMany`s the new
  ones. A failure anywhere changes nothing.
- **The dashboard is created lazily** by `replace` and `createWidget`
  (`ensureDashboard`: a guarded `updateMany` setting `dashboardCreatedAt`
  where it is null); `byWorkspace` is null until then. `remove` clears the
  three columns and deletes the widgets; `update` refuses
  (`DASHBOARD_NOT_FOUND`) while there is none.
- **`createWidget` places what it is not told.** With `row` and `sort`
  omitted the widget takes the first row (ascending) with room for its
  `column`, after that row's last card, else a new bottom row — the engine's
  `placeWidget`, run inside the transaction against the slots as they are
  then, so the grid fills top-first for every caller (the assistant's tool,
  the recommendations' Add, any API client). A `row` without a `sort` goes
  after that row's last card and must still fit. `replace` takes every
  placement as given.
- **`updateWidget` validates stored ⊕ patch.** The sheet is read again only
  when `query`, `spreadsheetId`, `type` or `variant` changes; the layout is
  checked against the dashboard's other widgets every time.
- **`query` is cast on read** (`toDashboardWidget`), the `ExternalApi.output`
  precedent: the service is the only writer and every write passed the
  schema and the engine.
- **Cascades do the deleting:** a sheet takes its widgets with it, a workspace
  its dashboard (its own columns) and widgets.
- **Column references are names**, matched trimmed and case-insensitively like
  the sheet's own uniqueness rule. Series keys must be identifiers because
  the chart primitive turns them into CSS variables.

## Reusable pieces

- `createSheetResolver` — "the sheet this workspace means, with its columns"
  for any feature that takes an optional `spreadsheetId`.
- `formatPath` + the issue → error mapping in `assertWidgetValid` — the
  pattern for surfacing engine validation as API errors.
- `buildStarterWidgets` — the worked example of a `WidgetQuery` per type; a
  starting point for any generated dashboard.
- `@reclit/dashboard-engine` itself: `parseFormula` / `evaluateRow` for any
  future row-level formula column.

## Used by

- `/` ([route doc](../routes/root.md)) — `byWorkspace` on load,
  `createStarter` from the empty state.
- The assistant's dashboard tools ([assistant.md](assistant.md)) —
  `createWidget`, `updateWidget`, `removeWidget`, `update`.
- The `generate-dashboard` task
  ([dashboard-generation.md](dashboard-generation.md)) — `replace` with the
  packed, verified cards of the best attempt.
- Nothing calls `replace` or `remove` from the UI: they are the surface an
  API caller rebuilds the dashboard through.
