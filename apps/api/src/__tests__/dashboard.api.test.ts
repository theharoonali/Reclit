/**
 * CONTRACT — dashboard
 * Feature doc: docs/features/dashboard.md · Rules: docs/rules/TESTING.md
 *
 * TABLES
 *   Dashboard        id (pk uuid), workspaceId (fk cascade → Workspace,
 *                    UNIQUE — one dashboard per workspace), title?,
 *                    description?, createdAt, updatedAt
 *   DashboardWidget  id (pk uuid), dashboardId (fk cascade → Dashboard),
 *                    spreadsheetId (fk cascade → Spreadsheet, indexed), name,
 *                    description?, type DashboardWidgetType, variant
 *                    (default "default"), row, column, sort, height
 *                    DashboardWidgetHeight (default MD), query Json,
 *                    createdAt, updatedAt, index(dashboardId, row, sort)
 *
 * DashboardWidgetType (db): STAT AREA BAR LINE PIE RADAR RADIAL HEATMAP TABLE
 * DashboardWidgetHeight (db): SM MD LG — lowercase on the wire ("bar", "md").
 *
 * The dashboard stores CONFIGURATION ONLY. No figure is ever stored: the
 * browser fetches the sheet (`spreadsheet.rows`) and computes every widget
 * with `@reclit/dashboard-engine` (`runWidget`). The API validates each
 * widget's query against the sheet's columns on every write with the same
 * engine (`validateWidget`), so a caller — an LLM rewriting the dashboard —
 * gets a precise error to fix instead of a blank card.
 *
 * MODELS (wire)
 *   DashboardDetail = { id; workspaceId; title: string | null;
 *                       description: string | null; widgets: DashboardWidget[]
 *                       (ordered by row, then sort); createdAt: Date;
 *                       updatedAt: Date }
 *   DashboardWidget = { id; dashboardId; spreadsheetId; name;
 *                       description: string | null; type; variant; row;
 *                       column (1..12, the span); sort; height: "sm"|"md"|"lg";
 *                       query: WidgetQuery; createdAt; updatedAt }
 *   WidgetInput     = { spreadsheetId?: string (default: the workspace's
 *                       sheet); name: 1..200; description?: string | null;
 *                       type; variant? (default "default"); row: 0..100;
 *                       column: 1..12; sort: 0..100; height? (default "md");
 *                       query: WidgetQuery }
 *   WidgetQuery     = {
 *     filters?:  { column; op: eq|neq|gt|gte|lt|lte|contains|in|isEmpty|
 *                  notEmpty; value?: string|number|boolean|(string|number)[]
 *                  (an array only for `in`; absent for isEmpty/notEmpty) }[]
 *                  (max 20, default [])
 *     groupBy?:  { column; bucket?: none|day|week|month|quarter|year
 *                  (default none; a bucket needs a date column) } | null —
 *                  the x-axis of a chart, the slices of a pie, the groups of
 *                  a table
 *     splitBy?:  { column; bucket?; limit?: 1..10 (default 5) } — a pivot:
 *                  each distinct value becomes its own series (grouped
 *                  charts and tables with exactly one series)
 *     series:    { key: identifier (/^[A-Za-z_][A-Za-z0-9_-]*$/, unique, not
 *                  "category"/"id"/"total"); label; formula; color?:
 *                  chart-1..chart-5; decimals?: 0..6; prefix?; suffix?
 *                  (≤ 10 chars); kind?: text|number|person|action (tables);
 *                  detailKey?: another series key (tables) }[] (1..10) —
 *                  the y-axes / KPIs / table columns
 *     sort?:     { by: "category" | "total" (pivots) | a series key;
 *                  direction: asc|desc }
 *     limit?:    1..500 (groups: default 20; plain table rows: default 50)
 *     compare?:  { formula; label } — stat only: the headline is compared
 *                  with this figure → trend + footer ("+12% vs last month")
 *     footer?:   string (≤ 200) — the line under a non-stat widget
 *   }
 *
 * FORMULAS (`@reclit/dashboard-engine`)
 *   `{Column Name}` reads a column (case-insensitive); literals: numbers,
 *   "strings" (or 'strings', doubled quote escapes), TRUE, FALSE, NULL;
 *   operators + - * / % = <> < <= > >= AND OR NOT, parentheses; row
 *   functions IF(c, a, b?) ABS ROUND(x, d?) FLOOR CEIL COALESCE(...) LEN
 *   LOWER UPPER TRIM; aggregates SUM AVG MIN MAX COUNT() COUNT(x)
 *   COUNT_DISTINCT FIRST LAST. Aggregates do not nest, and an aggregate
 *   formula may not read a column outside an aggregate (`SUM({A}) / {B}` is
 *   rejected; `SUM({A}) / SUM({B}) * 100` is fine). Blank cells are null:
 *   arithmetic and comparisons with null are null, SUM skips them, COUNT(x)
 *   counts the rest.
 *
 * RULES (validated on every write — `DASHBOARD_QUERY_INVALID` unless noted)
 * | Type (variant)                   | groupBy   | series                    | formulas            |
 * | -------------------------------- | --------- | ------------------------- | ------------------- |
 * | area, bar, line, radar, heatmap  | required  | 1..10 (1 with splitBy)    | aggregate           |
 * | pie, radial (default)            | required  | exactly 1                 | aggregate           |
 * | radial (stacked)                 | forbidden | 1..5                      | aggregate           |
 * | radial (text)                    | forbidden | exactly 1 (a 0–100 value) | aggregate           |
 * | stat                             | forbidden | 1..4 (+ compare)          | aggregate           |
 * | table                            | optional  | 1..10                     | aggregate if grouped, row-level otherwise |
 * Plus: every column named anywhere must exist on the widget's sheet
 * (`DASHBOARD_UNKNOWN_COLUMN`); every formula must parse
 * (`DASHBOARD_FORMULA_INVALID`); `variant` must belong to the type; a bucket
 * needs a date column; `sort.by` and `detailKey` must name a series;
 * `compare` is stat-only. The set as a whole: no two widgets in one
 * (row, sort) slot, and a row's spans add up to ≤ 12
 * (`DASHBOARD_LAYOUT_INVALID`).
 *
 * PROCEDURES
 * | Procedure               | Kind     | Payload                                                   | Response                | Errors                                                                      |
 * | ----------------------- | -------- | --------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
 * | dashboard.byWorkspace   | query    | { workspaceId }                                           | DashboardDetail \| null | NOT_FOUND (workspace)                                                       |
 * | dashboard.replace       | mutation | { workspaceId; title?; description?; widgets: WidgetInput[] (≤ 50) } | DashboardDetail | NOT_FOUND (workspace, spreadsheet), BAD_REQUEST (validation, layout, column, formula, query, mismatch) |
 * | dashboard.update        | mutation | { workspaceId; title?: string \| null; description?: string \| null } | DashboardDetail | NOT_FOUND (no dashboard), BAD_REQUEST                               |
 * | dashboard.remove        | mutation | { workspaceId }                                           | { id }                  | NOT_FOUND                                                                   |
 * | dashboard.createWidget  | mutation | { workspaceId } & WidgetInput                             | DashboardDetail         | NOT_FOUND (workspace, spreadsheet), BAD_REQUEST (as replace)                |
 * | dashboard.updateWidget  | mutation | { id } & Partial<WidgetInput>                             | DashboardDetail         | NOT_FOUND (widget, spreadsheet), BAD_REQUEST (as replace)                   |
 * | dashboard.removeWidget  | mutation | { id }                                                    | DashboardDetail         | NOT_FOUND                                                                   |
 * | dashboard.createStarter | mutation | { workspaceId }                                           | DashboardDetail         | NOT_FOUND (workspace, no sheet), CONFLICT (widgets exist)                   |
 *
 * NOTES
 * - One dashboard per workspace. `replace` and `createWidget` create it when
 *   it does not exist; `byWorkspace` is null until then. `title` and
 *   `description` are null by default — the page shows its own copy.
 * - `replace` is the whole dashboard at once, the call an LLM makes: every
 *   widget is validated first, then the old set is deleted and the new one
 *   written in one transaction. A payload with one bad widget changes
 *   nothing. `widgets: []` clears the dashboard. `title` / `description`
 *   omitted keep their value, `null` clears.
 * - A widget's `spreadsheetId` defaults to the workspace's sheet. A given id
 *   must exist (NOT_FOUND) and belong to the same workspace (BAD_REQUEST,
 *   `DASHBOARD_SPREADSHEET_MISMATCH`). Deleting a sheet cascades its widgets;
 *   deleting a workspace cascades its dashboard.
 * - Every widget mutation returns the whole `DashboardDetail`: the layout is
 *   a dashboard-wide rule and the client holds one query.
 * - `updateWidget` validates the stored widget merged with the patch: the
 *   query is re-checked against the sheet whenever `query`, `spreadsheetId`,
 *   `type` or `variant` changes, the layout always. `undefined` leaves a
 *   field alone; `description: null` clears it.
 * - Validation error messages name the place: "widgets[2].query.series[0]
 *   .formula". Codes: DASHBOARD_LAYOUT_INVALID, DASHBOARD_UNKNOWN_COLUMN,
 *   DASHBOARD_FORMULA_INVALID, DASHBOARD_QUERY_INVALID,
 *   DASHBOARD_SPREADSHEET_MISMATCH (all BAD_REQUEST); DASHBOARD_NOT_FOUND,
 *   DASHBOARD_WIDGET_NOT_FOUND (NOT_FOUND); DASHBOARD_NOT_EMPTY (CONFLICT).
 * - `createStarter` derives widgets from the sheet's columns — a row-count
 *   stat, a SUM stat per number column (max 3), the first number column by
 *   the first text column and by month of the first date column, and a
 *   table of the first six columns — and refuses when widgets already exist
 *   (`replace` overwrites). A sheet with no columns yields the row count.
 * - Column names are referenced by NAME. Renaming a referenced column does
 *   not touch stored widgets; the browser shows that card as invalid until
 *   the widget is rewritten.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";
import { pingDatabase } from "../db/prisma";
import type { RouterInputs } from "../trpc/routers/_app";
import { makeWorkspace, removeWorkspace } from "./support/fixtures";
import {
  caller,
  expectDate,
  expectError,
  expectTRPCError,
} from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere.
const dbUp = await pingDatabase();

type WidgetIn = RouterInputs["dashboard"]["replace"]["widgets"][number];

const createdWorkspaces: string[] = [];

/** A workspace whose sheet has Region (string), Revenue, Cost (number), Signed (date). */
async function makeHost(name = "dashboard host") {
  const workspace = await makeWorkspace(name);
  createdWorkspaces.push(workspace.id);
  const sheetId = workspace.spreadsheetId as string;
  await caller.spreadsheet.createColumn({ id: sheetId, name: "Region" });
  await caller.spreadsheet.createColumn({
    id: sheetId,
    name: "Revenue",
    type: "number",
  });
  await caller.spreadsheet.createColumn({
    id: sheetId,
    name: "Cost",
    type: "number",
  });
  await caller.spreadsheet.createColumn({
    id: sheetId,
    name: "Signed",
    type: "date",
  });
  return { id: workspace.id, sheetId };
}

afterAll(async () => {
  for (const id of createdWorkspaces) await removeWorkspace(id);
});

const stat = (over: Partial<WidgetIn> = {}): WidgetIn => ({
  name: "Deals",
  type: "stat",
  row: 0,
  column: 3,
  sort: 0,
  query: { series: [{ key: "n", label: "Deals", formula: "COUNT()" }] },
  ...over,
});

const bar = (over: Partial<WidgetIn> = {}): WidgetIn => ({
  name: "Revenue by region",
  type: "bar",
  row: 1,
  column: 12,
  sort: 0,
  query: {
    groupBy: { column: "Region" },
    series: [{ key: "rev", label: "Revenue", formula: "SUM({Revenue})" }],
  },
  ...over,
});

/** Asserts BAD_REQUEST and that the message names the problem. */
async function expectBadRequest(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  const error = await expectError(promise, TRPCError);
  expect(error.code).toBe("BAD_REQUEST");
  expect(error.message).toMatch(pattern);
}

describe.skipIf(!dbUp)("dashboard.replace", () => {
  it("creates the dashboard with its widgets and fills the defaults", async () => {
    const host = await makeHost();
    const dashboard = await caller.dashboard.replace({
      workspaceId: host.id,
      widgets: [stat()],
    });
    expect(dashboard).toMatchObject({
      workspaceId: host.id,
      title: null,
      description: null,
    });
    expectDate(dashboard.createdAt);
    expectDate(dashboard.updatedAt);
    expect(dashboard.widgets).toHaveLength(1);
    const widget = dashboard.widgets[0];
    expect(widget).toMatchObject({
      dashboardId: dashboard.id,
      spreadsheetId: host.sheetId,
      name: "Deals",
      description: null,
      type: "stat",
      variant: "default",
      row: 0,
      column: 3,
      sort: 0,
      height: "md",
      query: {
        filters: [],
        groupBy: null,
        series: [{ key: "n", label: "Deals", formula: "COUNT()" }],
      },
    });
    expectDate(widget?.createdAt);
  });

  it("accepts every field", async () => {
    const host = await makeHost();
    const widgets: WidgetIn[] = [
      {
        spreadsheetId: host.sheetId,
        name: "Revenue",
        description: "This quarter",
        type: "stat",
        variant: "default",
        row: 0,
        column: 4,
        sort: 0,
        height: "sm",
        query: {
          filters: [{ column: "Signed", op: "gte", value: "2026-01-01" }],
          series: [
            {
              key: "rev",
              label: "Revenue",
              formula: "SUM({Revenue})",
              prefix: "$",
              decimals: 0,
            },
            { key: "deals", label: "deals", formula: "COUNT()" },
          ],
          compare: { formula: "SUM({Cost})", label: "vs cost" },
        },
      },
      {
        name: "Revenue by month and region",
        type: "line",
        variant: "dots",
        row: 1,
        column: 8,
        sort: 0,
        height: "lg",
        query: {
          filters: [
            { column: "Region", op: "in", value: ["North", "South"] },
            { column: "Signed", op: "notEmpty" },
          ],
          groupBy: { column: "Signed", bucket: "month" },
          splitBy: { column: "Region", limit: 3 },
          series: [
            {
              key: "rev",
              label: "Revenue",
              formula: "SUM({Revenue})",
              color: "chart-3",
            },
          ],
          sort: { by: "category", direction: "asc" },
          limit: 12,
          footer: "Last twelve months",
        },
      },
      {
        name: "Top deals",
        type: "table",
        row: 1,
        column: 4,
        sort: 1,
        query: {
          series: [
            {
              key: "region",
              label: "Region",
              formula: "{Region}",
              kind: "person",
              detailKey: "signed",
            },
            { key: "signed", label: "Signed", formula: "{Signed}" },
            {
              key: "margin",
              label: "Margin",
              formula: "{Revenue} - {Cost}",
              kind: "number",
              suffix: " USD",
              decimals: 2,
            },
          ],
          sort: { by: "margin", direction: "desc" },
          limit: 5,
        },
      },
    ];
    const dashboard = await caller.dashboard.replace({
      workspaceId: host.id,
      title: "Sales",
      description: "Revenue, cost and the latest deals",
      widgets,
    });
    expect(dashboard).toMatchObject({
      title: "Sales",
      description: "Revenue, cost and the latest deals",
    });
    expect(dashboard.widgets.map((w) => w.name)).toEqual([
      "Revenue",
      "Revenue by month and region",
      "Top deals",
    ]);
    expect(dashboard.widgets[0]?.query).toEqual({
      filters: [{ column: "Signed", op: "gte", value: "2026-01-01" }],
      groupBy: null,
      series: [
        {
          key: "rev",
          label: "Revenue",
          formula: "SUM({Revenue})",
          prefix: "$",
          decimals: 0,
        },
        { key: "deals", label: "deals", formula: "COUNT()" },
      ],
      compare: { formula: "SUM({Cost})", label: "vs cost" },
    });
    expect(dashboard.widgets[1]).toMatchObject({
      variant: "dots",
      height: "lg",
      query: {
        groupBy: { column: "Signed", bucket: "month" },
        splitBy: { column: "Region", limit: 3 },
        sort: { by: "category", direction: "asc" },
        limit: 12,
        footer: "Last twelve months",
      },
    });
    expect(dashboard.widgets[2]?.query.series[0]).toMatchObject({
      kind: "person",
      detailKey: "signed",
    });
  });

  it("replaces the previous set atomically and clears with an empty array", async () => {
    const host = await makeHost();
    const first = await caller.dashboard.replace({
      workspaceId: host.id,
      title: "Kept",
      widgets: [stat(), bar()],
    });
    const second = await caller.dashboard.replace({
      workspaceId: host.id,
      widgets: [stat({ name: "Only" })],
    });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("Kept");
    expect(second.widgets.map((w) => w.name)).toEqual(["Only"]);
    expect(first.widgets.map((w) => w.id)).not.toContain(second.widgets[0]?.id);

    // One bad widget → nothing changes.
    await expectBadRequest(
      caller.dashboard.replace({
        workspaceId: host.id,
        widgets: [
          stat({ name: "Fine" }),
          bar({
            query: { groupBy: { column: "Nope" }, series: bar().query.series },
          }),
        ],
      }),
      /widgets\[1\]\.query\.groupBy\.column/,
    );
    const unchanged = await caller.dashboard.byWorkspace({
      workspaceId: host.id,
    });
    expect(unchanged?.widgets.map((w) => w.name)).toEqual(["Only"]);

    const cleared = await caller.dashboard.replace({
      workspaceId: host.id,
      title: null,
      widgets: [],
    });
    expect(cleared.widgets).toEqual([]);
    expect(cleared.title).toBeNull();
  });

  it("rejects a blank name and more than 50 widgets", async () => {
    const host = await makeHost();
    await expectTRPCError(
      caller.dashboard.replace({
        workspaceId: host.id,
        widgets: [stat({ name: "  " })],
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.dashboard.replace({
        workspaceId: host.id,
        widgets: Array.from({ length: 51 }, (_, i) =>
          stat({ row: i, column: 1 }),
        ),
      }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for an unknown workspace or sheet", async () => {
    const host = await makeHost();
    await expectTRPCError(
      caller.dashboard.replace({ workspaceId: "does-not-exist", widgets: [] }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      caller.dashboard.replace({
        workspaceId: host.id,
        widgets: [stat({ spreadsheetId: "does-not-exist" })],
      }),
      "NOT_FOUND",
    );
  });

  it("rejects another workspace's sheet", async () => {
    const host = await makeHost();
    const other = await makeHost("other host");
    await expectBadRequest(
      caller.dashboard.replace({
        workspaceId: host.id,
        widgets: [stat({ spreadsheetId: other.sheetId })],
      }),
      /does not belong to workspace/,
    );
  });

  it("validates the query against the sheet, naming the place", async () => {
    const host = await makeHost();
    const replace = (widget: WidgetIn) =>
      caller.dashboard.replace({ workspaceId: host.id, widgets: [widget] });

    await expectBadRequest(
      replace(
        stat({
          query: {
            series: [{ key: "n", label: "n", formula: "SUM({Profit})" }],
          },
        }),
      ),
      /Column "Profit" is not in the sheet at widgets\[0\]\.query\.series\[0\]\.formula/,
    );
    await expectBadRequest(
      replace(
        stat({
          query: {
            series: [{ key: "n", label: "n", formula: "SUM({Revenue}" }],
          },
        }),
      ),
      /Formula invalid at widgets\[0\]\.query\.series\[0\]\.formula/,
    );
    await expectBadRequest(
      replace(
        bar({
          query: {
            groupBy: { column: "Region" },
            series: [{ key: "r", label: "r", formula: "{Revenue}" }],
          },
        }),
      ),
      /must aggregate/,
    );
    await expectBadRequest(
      replace(
        bar({
          query: {
            groupBy: { column: "Region", bucket: "month" },
            series: bar().query.series,
          },
        }),
      ),
      /not a date column/,
    );
    await expectBadRequest(
      replace(bar({ variant: "donut" })),
      /not a bar variant/,
    );
    await expectBadRequest(
      replace(
        stat({
          query: {
            series: [{ key: "my key", label: "n", formula: "COUNT()" }],
          },
        }),
      ),
      /series/,
    );
    await expectBadRequest(
      replace(
        stat({
          query: { groupBy: { column: "Region" }, series: stat().query.series },
        }),
      ),
      /takes no groupBy/,
    );
    await expectBadRequest(
      replace(
        bar({
          query: {
            ...bar().query,
            compare: { formula: "COUNT()", label: "x" },
          },
        }),
      ),
      /compare/,
    );
  });

  it("rejects a row over 12 columns and a duplicate slot", async () => {
    const host = await makeHost();
    await expectBadRequest(
      caller.dashboard.replace({
        workspaceId: host.id,
        widgets: [stat({ column: 8 }), stat({ column: 5, sort: 1 })],
      }),
      /Layout invalid at widgets\[1\]: row 0 spans 13 of 12 columns/,
    );
    await expectBadRequest(
      caller.dashboard.replace({
        workspaceId: host.id,
        widgets: [stat({ column: 3 }), stat({ column: 3 })],
      }),
      /already has a widget at sort 0/,
    );
  });
});

describe.skipIf(!dbUp)("dashboard.byWorkspace", () => {
  it("is null until something is written, then returns widgets by row and sort", async () => {
    const host = await makeHost();
    expect(
      await caller.dashboard.byWorkspace({ workspaceId: host.id }),
    ).toBeNull();
    await caller.dashboard.replace({
      workspaceId: host.id,
      widgets: [
        bar({ name: "r1 s1", row: 1, sort: 1, column: 6 }),
        stat({ name: "r0 s1", row: 0, sort: 1 }),
        bar({ name: "r1 s0", row: 1, sort: 0, column: 6 }),
        stat({ name: "r0 s0", row: 0, sort: 0 }),
      ],
    });
    const dashboard = await caller.dashboard.byWorkspace({
      workspaceId: host.id,
    });
    expect(dashboard?.widgets.map((w) => w.name)).toEqual([
      "r0 s0",
      "r0 s1",
      "r1 s0",
      "r1 s1",
    ]);
  });

  it("returns NOT_FOUND for an unknown workspace", async () => {
    await expectTRPCError(
      caller.dashboard.byWorkspace({ workspaceId: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("dashboard.update", () => {
  it("sets, keeps and clears the title and description", async () => {
    const host = await makeHost();
    await caller.dashboard.replace({ workspaceId: host.id, widgets: [stat()] });
    const titled = await caller.dashboard.update({
      workspaceId: host.id,
      title: "Ops",
      description: "Daily",
    });
    expect(titled).toMatchObject({ title: "Ops", description: "Daily" });
    expect(titled.widgets).toHaveLength(1);
    const kept = await caller.dashboard.update({
      workspaceId: host.id,
      description: null,
    });
    expect(kept).toMatchObject({ title: "Ops", description: null });
  });

  it("rejects a blank title and NOT_FOUND without a dashboard", async () => {
    const host = await makeHost();
    await expectTRPCError(
      caller.dashboard.update({ workspaceId: host.id, title: "Ops" }),
      "NOT_FOUND",
    );
    await caller.dashboard.replace({ workspaceId: host.id, widgets: [] });
    await expectTRPCError(
      caller.dashboard.update({ workspaceId: host.id, title: " " }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("dashboard.remove", () => {
  it("removes the dashboard and its widgets", async () => {
    const host = await makeHost();
    const created = await caller.dashboard.replace({
      workspaceId: host.id,
      widgets: [stat()],
    });
    expect(await caller.dashboard.remove({ workspaceId: host.id })).toEqual({
      id: created.id,
    });
    expect(
      await caller.dashboard.byWorkspace({ workspaceId: host.id }),
    ).toBeNull();
    await expectTRPCError(
      caller.dashboard.removeWidget({ id: created.widgets[0]?.id as string }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      caller.dashboard.remove({ workspaceId: host.id }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("dashboard.createWidget", () => {
  it("creates the dashboard lazily and appends the widget", async () => {
    const host = await makeHost();
    const first = await caller.dashboard.createWidget({
      workspaceId: host.id,
      ...stat(),
    });
    expect(first.widgets).toHaveLength(1);
    const second = await caller.dashboard.createWidget({
      workspaceId: host.id,
      ...bar({ description: "Grouped", height: "lg" }),
    });
    expect(second.id).toBe(first.id);
    expect(second.widgets.map((w) => w.name)).toEqual([
      "Deals",
      "Revenue by region",
    ]);
    expect(second.widgets[1]).toMatchObject({
      description: "Grouped",
      height: "lg",
      spreadsheetId: host.sheetId,
    });
  });

  it("rejects a taken slot, an overflowing row and an invalid query", async () => {
    const host = await makeHost();
    await caller.dashboard.createWidget({
      workspaceId: host.id,
      ...stat({ column: 8 }),
    });
    await expectBadRequest(
      caller.dashboard.createWidget({ workspaceId: host.id, ...stat() }),
      /already has a widget at sort 0/,
    );
    await expectBadRequest(
      caller.dashboard.createWidget({
        workspaceId: host.id,
        ...stat({ sort: 1, column: 6 }),
      }),
      /spans 14 of 12/,
    );
    await expectBadRequest(
      caller.dashboard.createWidget({
        workspaceId: host.id,
        ...stat({
          sort: 1,
          query: { series: [{ key: "n", label: "n", formula: "SUM({Nope})" }] },
        }),
      }),
      /Column "Nope" is not in the sheet at query\.series\[0\]\.formula/,
    );
  });

  it("returns NOT_FOUND for an unknown workspace", async () => {
    await expectTRPCError(
      caller.dashboard.createWidget({
        workspaceId: "does-not-exist",
        ...stat(),
      }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("dashboard.updateWidget", () => {
  it("patches fields and leaves the rest intact", async () => {
    const host = await makeHost();
    const dashboard = await caller.dashboard.replace({
      workspaceId: host.id,
      widgets: [stat(), bar()],
    });
    const id = dashboard.widgets[1]?.id as string;
    const renamed = await caller.dashboard.updateWidget({
      id,
      name: "Renamed",
      height: "sm",
    });
    expect(renamed.widgets[1]).toMatchObject({
      id,
      name: "Renamed",
      height: "sm",
      variant: "default",
      query: bar().query,
    });
    const moved = await caller.dashboard.updateWidget({
      id,
      row: 2,
      column: 6,
      description: "Moved",
    });
    expect(moved.widgets[1]).toMatchObject({
      row: 2,
      column: 6,
      description: "Moved",
      name: "Renamed",
    });
  });

  it("revalidates the query and the layout", async () => {
    const host = await makeHost();
    const dashboard = await caller.dashboard.replace({
      workspaceId: host.id,
      widgets: [stat(), stat({ name: "Second", sort: 1 })],
    });
    const id = dashboard.widgets[1]?.id as string;
    await expectBadRequest(
      caller.dashboard.updateWidget({ id, sort: 0 }),
      /already has a widget at sort 0/,
    );
    await expectBadRequest(
      caller.dashboard.updateWidget({
        id,
        query: { series: [{ key: "n", label: "n", formula: "SUM({Nope})" }] },
      }),
      /Column "Nope"/,
    );
    await expectBadRequest(
      caller.dashboard.updateWidget({ id, type: "bar" }),
      /needs a groupBy/,
    );
    await expectBadRequest(
      caller.dashboard.updateWidget({ id, variant: "donut" }),
      /not a stat variant/,
    );
    const retyped = await caller.dashboard.updateWidget({
      id,
      type: "bar",
      query: bar().query,
    });
    expect(retyped.widgets[1]).toMatchObject({
      type: "bar",
      query: bar().query,
    });
  });

  it("returns NOT_FOUND for an unknown widget", async () => {
    await expectTRPCError(
      caller.dashboard.updateWidget({ id: "does-not-exist", name: "x" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("dashboard.removeWidget", () => {
  it("removes one widget and returns the rest", async () => {
    const host = await makeHost();
    const dashboard = await caller.dashboard.replace({
      workspaceId: host.id,
      widgets: [stat(), bar()],
    });
    const id = dashboard.widgets[0]?.id as string;
    const rest = await caller.dashboard.removeWidget({ id });
    expect(rest.widgets.map((w) => w.name)).toEqual(["Revenue by region"]);
    await expectTRPCError(caller.dashboard.removeWidget({ id }), "NOT_FOUND");
  });
});

describe.skipIf(!dbUp)("dashboard.createStarter", () => {
  it("builds widgets from the sheet's columns", async () => {
    const host = await makeHost();
    const dashboard = await caller.dashboard.createStarter({
      workspaceId: host.id,
    });
    expect(
      dashboard.widgets.map((w) => [w.type, w.name, w.row, w.sort, w.column]),
    ).toEqual([
      ["stat", "Rows", 0, 0, 4],
      ["stat", "Total Revenue", 0, 1, 4],
      ["stat", "Total Cost", 0, 2, 4],
      ["bar", "Total Revenue by Region", 1, 0, 6],
      ["line", "Total Revenue by month", 1, 1, 6],
      ["table", "Latest rows", 2, 0, 12],
    ]);
    expect(dashboard.widgets[1]?.query.series[0]?.formula).toBe(
      "SUM({Revenue})",
    );
    expect(dashboard.widgets[4]?.query).toMatchObject({
      filters: [{ column: "Signed", op: "notEmpty" }],
      groupBy: { column: "Signed", bucket: "month" },
    });
    expect(dashboard.widgets[5]?.query.series.map((s) => s.formula)).toEqual([
      "{Region}",
      "{Revenue}",
      "{Cost}",
      "{Signed}",
    ]);
    expect(
      await caller.dashboard.byWorkspace({ workspaceId: host.id }),
    ).toEqual(dashboard);
  });

  it("refuses to overwrite widgets, and a bare sheet yields the row count", async () => {
    const host = await makeHost();
    await caller.dashboard.createStarter({ workspaceId: host.id });
    await expectTRPCError(
      caller.dashboard.createStarter({ workspaceId: host.id }),
      "CONFLICT",
    );

    const bare = await makeWorkspace("bare host");
    createdWorkspaces.push(bare.id);
    const starter = await caller.dashboard.createStarter({
      workspaceId: bare.id,
    });
    expect(starter.widgets.map((w) => w.name)).toEqual(["Rows"]);
  });

  it("returns NOT_FOUND for an unknown workspace", async () => {
    await expectTRPCError(
      caller.dashboard.createStarter({ workspaceId: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("cascades", () => {
  it("deleting a sheet removes the widgets that read it", async () => {
    const host = await makeHost();
    const extra = await caller.spreadsheet.create({
      name: "extra sheet",
      workspaceId: host.id,
    });
    await caller.spreadsheet.createColumn({
      id: extra.id,
      name: "Amount",
      type: "number",
    });
    const dashboard = await caller.dashboard.replace({
      workspaceId: host.id,
      widgets: [
        stat(),
        stat({
          name: "Extra",
          sort: 1,
          spreadsheetId: extra.id,
          query: {
            series: [{ key: "a", label: "a", formula: "SUM({Amount})" }],
          },
        }),
      ],
    });
    expect(dashboard.widgets).toHaveLength(2);
    await caller.spreadsheet.remove({ id: extra.id });
    const after = await caller.dashboard.byWorkspace({ workspaceId: host.id });
    expect(after?.widgets.map((w) => w.name)).toEqual(["Deals"]);
  });
});

describe.skipIf(dbUp)("database unavailable", () => {
  it("skips the dashboard contract", () => {
    expect(dbUp).toBe(false);
  });
});
