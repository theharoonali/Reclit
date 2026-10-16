import { describe, expect, it } from "bun:test";
import {
  runWidget,
  type WidgetData,
  type WidgetQuery,
  type WidgetSpec,
} from "../src/index";
import { payload, SHEET } from "./support/sheet";

const query = (partial: Partial<WidgetQuery>): WidgetQuery => ({
  filters: [],
  groupBy: null,
  series: [],
  ...partial,
});

function run(spec: WidgetSpec, sheet = SHEET): WidgetData {
  const result = runWidget(spec, sheet);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.data;
}

const sum = (key: string, column: string, label = key) => ({
  key,
  label,
  formula: `SUM({${column}})`,
});

describe("runWidget — grouped charts", () => {
  it("bar by a text column: one record per group, first series descending", () => {
    const data = run({
      type: "bar",
      variant: "default",
      query: query({
        groupBy: { column: "Region", bucket: "none" },
        series: [sum("rev", "Revenue"), sum("cost", "Cost")],
      }),
    });
    expect(data.categoryKey).toBe("category");
    expect(data.series).toEqual([
      { key: "rev", label: "rev", color: "chart-1" },
      { key: "cost", label: "cost", color: "chart-2" },
    ]);
    expect(data.rows).toEqual([
      { category: "North", rev: 300, cost: 180 },
      { category: "South", rev: 50, cost: 30 },
      { category: "(empty)", rev: 30, cost: 5 },
    ]);
  });

  it("line by month: chronological buckets, blanks filtered out", () => {
    const data = run({
      type: "line",
      variant: "default",
      query: query({
        filters: [{ column: "Signed", op: "notEmpty" }],
        groupBy: { column: "Signed", bucket: "month" },
        series: [{ key: "n", label: "Deals", formula: "COUNT()" }],
      }),
    });
    expect(data.rows).toEqual([
      { category: "2026-01", n: 1 },
      { category: "2026-02", n: 2 },
      { category: "2026-03", n: 1 },
    ]);
  });

  it("honours sort, limit, decimals and an explicit colour", () => {
    const data = run({
      type: "bar",
      variant: "horizontal",
      query: query({
        groupBy: { column: "Seller", bucket: "none" },
        series: [
          {
            key: "avg",
            label: "Avg",
            formula: "AVG({Revenue})",
            decimals: 1,
            color: "chart-4",
          },
        ],
        sort: { by: "category", direction: "asc" },
        limit: 2,
      }),
    });
    expect(data.series[0]?.color).toBe("chart-4");
    expect(data.rows).toEqual([
      { category: "Ann", avg: 75 },
      { category: "Bob", avg: 115 },
    ]);
  });

  it("passes the footer through", () => {
    const data = run({
      type: "area",
      variant: "gradient",
      query: query({
        groupBy: { column: "Region", bucket: "none" },
        series: [sum("rev", "Revenue")],
        footer: "All time",
      }),
    });
    expect(data.footer).toBe("All time");
  });

  it("pie: slices get minted keys, the category text as label and cycling colours", () => {
    const data = run({
      type: "pie",
      variant: "donut",
      query: query({
        groupBy: { column: "Seller", bucket: "none" },
        series: [sum("rev", "Revenue")],
      }),
    });
    expect(data.categoryKey).toBe("category");
    expect(data.valueKey).toBe("value");
    expect(data.series).toEqual([
      { key: "k0", label: "Bob", color: "chart-1" },
      { key: "k1", label: "Ann", color: "chart-2" },
      { key: "k2", label: "Cara", color: "chart-3" },
    ]);
    expect(data.rows).toEqual([
      { category: "k0", value: 230 },
      { category: "k1", value: 150 },
      { category: "k2", value: 0 },
    ]);
  });

  it("grouped table gets the category as its first column, named after the sheet's column", () => {
    const data = run({
      type: "table",
      variant: "default",
      query: query({
        groupBy: { column: "region", bucket: "none" },
        series: [{ key: "n", label: "Deals", formula: "COUNT()" }],
      }),
    });
    expect(data.series[0]).toEqual({ key: "category", label: "Region" });
    expect(data.rows[0]).toEqual({ category: "North", n: 2 });
  });
});

describe("runWidget — pivots", () => {
  it("splitBy turns the top split values into series", () => {
    const data = run({
      type: "bar",
      variant: "stacked",
      query: query({
        groupBy: { column: "Region", bucket: "none" },
        splitBy: { column: "Seller", limit: 2 },
        series: [sum("rev", "Revenue")],
      }),
    });
    expect(data.series).toEqual([
      { key: "s0", label: "Bob", color: "chart-1" },
      { key: "s1", label: "Ann", color: "chart-2" },
    ]);
    expect(data.rows).toEqual([
      { category: "North", s0: 200, s1: 100 },
      { category: "South", s0: 0, s1: 50 },
      { category: "(empty)", s0: 30, s1: 0 },
    ]);
  });

  it("sorts a pivot by total when asked", () => {
    const data = run({
      type: "line",
      variant: "default",
      query: query({
        groupBy: { column: "Region", bucket: "none" },
        splitBy: { column: "Seller" },
        series: [sum("rev", "Revenue")],
        sort: { by: "total", direction: "asc" },
      }),
    });
    expect(data.rows.map((row) => row.category)).toEqual([
      "(empty)",
      "South",
      "North",
    ]);
    expect(Object.keys(data.rows[0] ?? {})).not.toContain("total");
  });
});

describe("runWidget — single-record widgets", () => {
  it("stat: headline, secondary figures and a compare footer", () => {
    const data = run({
      type: "stat",
      variant: "default",
      query: query({
        series: [
          { key: "rows", label: "Rows", formula: "COUNT()" },
          {
            key: "rev",
            label: "revenue",
            formula: "SUM({Revenue})",
            prefix: "$",
          },
        ],
        compare: { formula: "COUNT({Revenue})", label: "vs with revenue" },
      }),
    });
    expect(data.valueKey).toBe("rows");
    expect(data.series).toEqual([
      { key: "rows", label: "Rows", color: "chart-1" },
      { key: "rev", label: "revenue", color: "chart-2", prefix: "$" },
    ]);
    expect(data.rows).toEqual([{ rows: 5, rev: 380 }]);
    expect(data.trend).toBe("up");
    expect(data.footer).toBe("+25% vs with revenue");
  });

  it("stat: a falling figure trends down, a zero base shows the delta", () => {
    const down = run({
      type: "stat",
      variant: "default",
      query: query({
        series: [{ key: "cost", label: "Cost", formula: "SUM({Cost})" }],
        compare: { formula: "SUM({Revenue})", label: "of revenue" },
      }),
    });
    expect(down.trend).toBe("down");
    expect(down.footer).toBe("-43% of revenue");

    const zero = run(
      {
        type: "stat",
        variant: "default",
        query: query({
          series: [{ key: "n", label: "N", formula: "COUNT()" }],
          compare: { formula: "COUNT({Nothing})", label: "new" },
        }),
      },
      SHEET_WITH_BLANK_COLUMN(),
    );
    expect(zero.footer).toBe("+5 new");
  });

  it("radial stacked and text carry their series on one record", () => {
    const stacked = run({
      type: "radial",
      variant: "stacked",
      query: query({ series: [sum("rev", "Revenue"), sum("cost", "Cost")] }),
    });
    expect(stacked.rows).toEqual([{ rev: 380, cost: 215, category: "" }]);
    expect(stacked.valueKey).toBe("rev");

    const text = run({
      type: "radial",
      variant: "text",
      query: query({
        series: [
          {
            key: "pct",
            label: "Cost share",
            formula: "SUM({Cost}) / SUM({Revenue}) * 100",
            decimals: 0,
          },
        ],
      }),
    });
    expect(text.rows).toEqual([{ pct: 57, category: "pct" }]);
  });
});

describe("runWidget — row tables", () => {
  it("lists filtered rows with row-level formulas, sorted and limited", () => {
    const data = run({
      type: "table",
      variant: "default",
      query: query({
        series: [
          {
            key: "seller",
            label: "Seller",
            formula: "{Seller}",
            kind: "person",
          },
          {
            key: "profit",
            label: "Profit",
            formula: "{Revenue} - {Cost}",
            kind: "number",
          },
          { key: "paid", label: "Paid", formula: "{Paid}" },
        ],
        sort: { by: "profit", direction: "desc" },
        limit: 2,
      }),
    });
    expect(data.categoryKey).toBe("id");
    expect(data.series[0]).toEqual({
      key: "seller",
      label: "Seller",
      color: "chart-1",
      kind: "person",
    });
    expect(data.rows).toEqual([
      { id: "row.1", seller: "Bob", profit: 80, paid: "false" },
      { id: "row.0", seller: "Ann", profit: 40, paid: "true" },
    ]);
  });

  it("keeps sheet order by default and reverses it for category desc", () => {
    const spec: WidgetSpec = {
      type: "table",
      variant: "default",
      query: query({ series: [{ key: "s", label: "S", formula: "{Seller}" }] }),
    };
    expect(run(spec).rows.map((row) => row.id)).toEqual([
      "row.0",
      "row.1",
      "row.2",
      "row.3",
      "row.4",
    ]);
    const reversed = run({
      ...spec,
      query: { ...spec.query, sort: { by: "category", direction: "desc" } },
    });
    expect(reversed.rows[0]?.id).toBe("row.4");
  });

  it("renders a date cell as an ISO string", () => {
    const data = run({
      type: "table",
      variant: "default",
      query: query({
        series: [{ key: "d", label: "Signed", formula: "{Signed}" }],
        limit: 1,
      }),
    });
    expect(data.rows[0]?.d).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("runWidget — failures never throw", () => {
  it("reports an unknown column with its name", () => {
    const result = runWidget(
      {
        type: "stat",
        variant: "default",
        query: query({ series: [sum("x", "Nope")] }),
      },
      SHEET,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({
        code: "UNKNOWN_COLUMN",
        detail: "Nope",
        path: ["series", 0, "formula"],
      });
    }
  });

  it("reports a formula that does not parse", () => {
    const result = runWidget(
      {
        type: "stat",
        variant: "default",
        query: query({
          series: [{ key: "x", label: "x", formula: "SUM({Revenue}" }],
        }),
      },
      SHEET,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("FORMULA_INVALID");
  });

  it("runs on an empty sheet", () => {
    const data = run(
      {
        type: "stat",
        variant: "default",
        query: query({
          series: [{ key: "n", label: "n", formula: "COUNT()" }],
        }),
      },
      payload([]),
    );
    expect(data.rows).toEqual([{ n: 0 }]);
  });
});

/** The fixture plus a column every row leaves blank, so `COUNT` of it is 0. */
function SHEET_WITH_BLANK_COLUMN() {
  return {
    ...SHEET,
    columns: [...SHEET.columns, { name: "Nothing", type: "number" }],
  };
}
