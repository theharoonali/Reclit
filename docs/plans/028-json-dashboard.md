# 028 — A JSON-driven dashboard of shadcn charts

**Status:** implemented
**Scope:** frontend

## Goal

`/` renders the dashboard from the sample design, and the whole dashboard is
described by **one JSON file of one type**. Each widget entry sets:

- `type` (`stat`, `area`, `bar`, `line`, `pie`, `radar`, `radial`,
  `heatmap` or `table`) and a `variant`
- its position: `row`, `column` (a span out of 12) and `sort` (its order
  within the row)
- `height`, `name` and `data`

A row fills its 12 columns from left to right in `sort` order, and any
columns left over stay empty. For now the data is dummy data in
`apps/dashboard/src/dummy-data/`. It is read only through `getDashboard()`,
so an API that returns the same type can replace it later.

## Backend (Agent 1)

- None. There is no API yet; see "Integration".

## Frontend (Agent 2)

- **shadcn:**
  - Add `packages/ui/components.json`, then add the `chart`, `card` and
    `table` primitives to `@reclit/ui` through the CLI.
  - Adapt them to the house rules: `cn` from `../utils`, no animation,
    `rounded-sm`, type-scale classes, and `hsl(var(--chart-N))` colours.
  - Put `recharts` in the root catalog.
- **Tokens:**
  - The colours `chart-1` … `chart-5`.
  - The heights `chart-sm`, `chart-md` and `chart-lg`.
- **`dummy-data/`:**
  - `dashboard.schema.ts`: one zod schema, with `DashboardWidget` and
    `Dashboard` inferred from it.
  - `dashboard.json`: the dashboard itself.
  - `dashboard-store.ts`: `getDashboard()`, which validates the JSON once.
- **`lib/dashboard/`:** `toRows` for grouping and sorting, the static
  span and height class maps, and the `ChartConfig` builder.
- **`components/dashboard/`:**
  - `dashboard-grid.tsx` (RSC): each row is its own 12-column grid.
  - `dashboard-widget.tsx`: the card, plus an exhaustive switch over `type`.
  - `widgets/*`: one client component per type.

## Integration (Agent 3)

- Later, `getDashboard()` becomes a `dashboard.get` query that returns the
  same `Dashboard` type. The components do not change.

## Decisions

- **One `data` shape for every type** (`categoryKey`, `valueKey`, `series`,
  `rows`, `footer`, `trend`) rather than a separate shape per type, so the
  JSON really is one type. A discriminated union was rejected because it
  would give each type its own `data` type.
- **Colours in the JSON are token names** (`chart-1` … `chart-5`), never hex
  values, following the no-raw-colour rule.
- **Widget names and table text are data** (they live in the JSON, not
  `en.json`), just as workspace names are.
- **Each row is its own grid,** so a short row keeps its empty columns rather
  than pulling up widgets from the next row.

## Risks / open questions

- The stock shadcn `chart.tsx` assumes oklch and Tailwind v4. It is adapted
  to the HSL tokens and Tailwind v3 used here.

---

## Outcome

- **Shipped:**
  - **shadcn:** `packages/ui/components.json`. The CLI ran (`add chart card
    table`), detected Tailwind v3 and installed `recharts@2.15.4`, which is
    now a catalog entry. It produced `@reclit/ui/{chart,card,table}`.
  - **Tokens:** `chart-1` … `chart-5` and `chart-sm/md/lg`.
  - **`apps/dashboard/src/dummy-data/`:** `dashboard.schema.ts`,
    `dashboard.json` and `dashboard-store.ts`.
  - **`apps/dashboard/src/lib/dashboard/layout.ts`.**
  - **`apps/dashboard/src/components/dashboard/`:** the grid, the widget, and
    `widgets/*`, which cover 9 types and every variant in the table above.
  - **The dashboard JSON:** 19 widgets in 8 rows. Rows 0–4 follow the sample.
    Row 5 is an 8-wide area chart that leaves 4 columns empty. Rows 6–7 show
    the remaining variants (pie `label`, radial `text`, line `step`, bar
    `stacked`, radar `dots`).
  - **Tests:** `apps/dashboard/tests/dashboard/dashboard.test.ts`, 15 tests.
- **Deviated:**
  - **Card height:** `height` sets the chart body (and the heatmap's). Stat
    cards and tables keep their natural height.
  - **`PageShell`:** it gained a `wide` prop, so the dashboard grid is not
    capped at `max-w-6xl`.
  - **`chart.tsx` legend keys:** shadcn's `key={item.value}` collides for
    radial legends, so the key now includes the item's position.
  - **Recharts:** a `<Label>` must be a direct child element, because recharts
    matches children by element type. The radial chart's centre label is
    therefore a function, not a component.
- **Not done:**
  - The design's interactive controls: the period select, the ⋯ menus, the
    month pager and the table search.
  - A handler for the table's "Contact" button.
  - A dashboard API. `getDashboard()` is the seam for adding one.
- **Docs updated:**
  - `docs/routes/root.md` and `docs/routes/index.md`.
  - `docs/rules/FRONTEND.md`: the tree (`dummy-data/`), the inventory
    (`card`, `chart`, `table`), the shadcn CLI and edits, and the chart
    tokens.
