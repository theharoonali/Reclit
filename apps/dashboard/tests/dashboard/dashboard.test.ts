import { describe, expect, test } from "bun:test";
import dashboardJson from "@/dummy-data/dashboard.json";
import {
  type DashboardWidget,
  dashboardSchema,
  WIDGET_TYPES,
} from "@/dummy-data/dashboard.schema";
import { getDashboard } from "@/dummy-data/dashboard-store";
import { heatLevel, toChartConfig, toRows } from "@/lib/dashboard/layout";

/** A valid bar widget; override any field to break it. */
function widget(overrides: Record<string, unknown> = {}) {
  return {
    id: "w",
    name: "Widget",
    type: "bar",
    variant: "default",
    row: 0,
    column: 6,
    sort: 0,
    height: "md",
    data: {
      categoryKey: "day",
      series: [{ key: "done", label: "Done", color: "chart-1" }],
      rows: [{ day: "Mon", done: 3 }],
    },
    ...overrides,
  };
}

const parse = (widgets: unknown[]) => dashboardSchema.safeParse({ widgets });

describe("dummy dashboard", () => {
  test("the JSON matches the dashboard type", () => {
    expect(dashboardSchema.safeParse(dashboardJson).success).toBe(true);
    expect(getDashboard().widgets.length).toBeGreaterThan(0);
  });

  test("shows every widget type", () => {
    const types = new Set(getDashboard().widgets.map((w) => w.type));
    expect([...types].sort()).toEqual([...WIDGET_TYPES].sort());
  });
});

describe("dashboardSchema", () => {
  test("accepts a valid widget and fills the defaults", () => {
    const result = dashboardSchema.parse({
      widgets: [widget({ variant: undefined, height: undefined })],
    });
    expect(result.widgets[0]).toMatchObject({
      variant: "default",
      height: "md",
    });
  });

  test("rejects a row whose spans exceed 12 columns", () => {
    const result = parse([
      widget({ id: "a", column: 8, sort: 0 }),
      widget({ id: "b", column: 6, sort: 1 }),
    ]);
    expect(result.success).toBe(false);
  });

  test("allows a row that fills fewer than 12 columns", () => {
    expect(parse([widget({ column: 8 })]).success).toBe(true);
  });

  test("rejects two widgets in the same row and sort slot", () => {
    const result = parse([
      widget({ id: "a", column: 4 }),
      widget({ id: "b", column: 4 }),
    ]);
    expect(result.success).toBe(false);
  });

  test("rejects a duplicate id", () => {
    const result = parse([widget({ row: 0 }), widget({ row: 1 })]);
    expect(result.success).toBe(false);
  });

  test("rejects a span of 0 or 13", () => {
    expect(parse([widget({ column: 0 })]).success).toBe(false);
    expect(parse([widget({ column: 13 })]).success).toBe(false);
  });

  test("rejects an unknown type and a variant of another type", () => {
    expect(parse([widget({ type: "gauge" })]).success).toBe(false);
    expect(parse([widget({ variant: "donut" })]).success).toBe(false);
  });

  test("rejects a series key missing from the rows", () => {
    const result = parse([
      widget({
        data: {
          categoryKey: "day",
          series: [{ key: "missing", label: "Missing" }],
          rows: [{ day: "Mon", done: 3 }],
        },
      }),
    ]);
    expect(result.success).toBe(false);
  });

  test("rejects a pie slice that matches no record", () => {
    const result = parse([
      widget({
        type: "pie",
        data: {
          categoryKey: "mood",
          valueKey: "share",
          series: [{ key: "angry", label: "Angry" }],
          rows: [{ mood: "happy", share: 60 }],
        },
      }),
    ]);
    expect(result.success).toBe(false);
  });

  test("rejects a stat without its headline field", () => {
    const result = parse([
      widget({
        type: "stat",
        data: { valueKey: "done", series: [], rows: [{ total: 3 }] },
      }),
    ]);
    expect(result.success).toBe(false);
  });
});

describe("toRows", () => {
  test("orders rows ascending and widgets by sort", () => {
    const widgets = dashboardSchema.parse({
      widgets: [
        widget({ id: "c", row: 2, sort: 0, column: 4 }),
        widget({ id: "b", row: 0, sort: 1, column: 4 }),
        widget({ id: "a", row: 0, sort: 0, column: 4 }),
      ],
    }).widgets;
    const rows = toRows(widgets);
    expect(rows.map((r) => r.row)).toEqual([0, 2]);
    expect(rows[0]?.widgets.map((w: DashboardWidget) => w.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("helpers", () => {
  test("toChartConfig maps series to labels and token colours", () => {
    expect(
      toChartConfig([
        { key: "done", label: "Done", color: "chart-3" },
        { key: "rest", label: "Rest" },
      ]),
    ).toEqual({
      done: { label: "Done", color: "hsl(var(--chart-3))" },
      rest: { label: "Rest", color: "hsl(var(--chart-1))" },
    });
  });

  test("heatLevel buckets 0–100 into five steps", () => {
    expect([0, 10, 20, 55, 80, 100, null, "x"].map(heatLevel)).toEqual([
      0, 0, 1, 2, 4, 4, 0, 0,
    ]);
  });
});
