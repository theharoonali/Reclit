import { describe, expect, test } from "bun:test";
import type { ColumnMeta } from "@reclit/dashboard-engine";
import {
  addSeries,
  fromRecommendations,
  isFormulaValid,
  newWidgetDraft,
  removeSeries,
  setGroupBy,
  setType,
  toWidgetInputs,
  updateSeries,
  variantsFor,
  widgetDraftIssues,
} from "@/lib/onboarding/widget-draft";

const columns: ColumnMeta[] = [
  { name: "Region", type: "string" },
  { name: "Amount", type: "number" },
  { name: "Signed", type: "date" },
];

const recommendation = {
  name: "Revenue by region",
  description: null,
  type: "bar" as const,
  variant: "default",
  height: "md" as const,
  column: 6,
  query: {
    filters: [],
    groupBy: { column: "Region", bucket: "none" as const },
    series: [{ key: "revenue", label: "Revenue", formula: "SUM({Amount})" }],
  },
};

describe("widget drafts", () => {
  test("keys recommendations per seed and starts a new card from the first text column", () => {
    expect(fromRecommendations([recommendation], 2)[0]?.key).toBe("card-2-0");
    const fresh = newWidgetDraft(columns, "new-1", "New card");
    expect(fresh).toMatchObject({
      type: "bar",
      column: 6,
      query: { groupBy: { column: "Region", bucket: "none" } },
    });
    expect(
      newWidgetDraft([{ name: "N", type: "number" }], "n", "x"),
    ).toMatchObject({ type: "stat", column: 3, query: { groupBy: null } });
  });

  test("retyping resets the style and width, and a stat loses its axis", () => {
    const draft = fromRecommendations([recommendation])[0]!;
    const stat = setType({ ...draft, variant: "stacked" }, "stat");
    expect(stat).toMatchObject({ variant: "default", column: 3 });
    expect(stat.query.groupBy).toBeNull();
    expect(setType(draft, "table").column).toBe(12);
    expect(variantsFor("pie")).toContain("donut");
  });

  test("edits the axis and the series", () => {
    const draft = fromRecommendations([recommendation])[0]!;
    expect(setGroupBy(draft, "Signed", "month").query.groupBy).toEqual({
      column: "Signed",
      bucket: "month",
    });
    expect(setGroupBy(draft, null).query.groupBy).toBeNull();
    const two = addSeries(draft, "Revenue");
    expect(two.query.series.map((s) => s.key)).toEqual([
      "revenue",
      "revenue_2",
    ]);
    expect(addSeries(draft, "Total!").query.series[1]?.key).toBe("total_1");
    expect(addSeries(draft, "2 cats").query.series[1]?.key).toBe("cats");
    expect(
      updateSeries(two, "revenue_2", { formula: "AVG({Amount})" }).query
        .series[1]?.formula,
    ).toBe("AVG({Amount})");
    expect(removeSeries(two, "revenue").query.series).toHaveLength(1);
    expect(removeSeries(draft, "revenue").query.series).toHaveLength(1);
  });

  test("validates against the sheet's columns and the formula grammar", () => {
    const draft = fromRecommendations([recommendation])[0]!;
    expect(widgetDraftIssues(draft, columns)).toEqual([]);
    const broken = updateSeries(draft, "revenue", { formula: "SUM({Nope})" });
    expect(widgetDraftIssues(broken, columns)[0]?.code).toBe("UNKNOWN_COLUMN");
    expect(isFormulaValid("SUM({Amount}) / COUNT()")).toBe(true);
    expect(isFormulaValid("SUM({Amount}")).toBe(false);
    expect(isFormulaValid("   ")).toBe(false);
  });

  test("places the cards top-first for dashboard.replace", () => {
    const drafts = fromRecommendations([
      {
        ...recommendation,
        type: "stat",
        column: 3,
        query: { ...recommendation.query, groupBy: null },
      },
      {
        ...recommendation,
        type: "stat",
        column: 3,
        query: { ...recommendation.query, groupBy: null },
      },
      recommendation,
      { ...recommendation, column: 12 },
    ]);
    const inputs = toWidgetInputs(drafts, "sheet-1");
    expect(inputs.map(({ row, sort, column }) => [row, sort, column])).toEqual([
      [0, 0, 3],
      [0, 1, 3],
      [0, 2, 6],
      [1, 0, 12],
    ]);
    expect(inputs[0]).toMatchObject({
      spreadsheetId: "sheet-1",
      name: "Revenue by region",
    });
    expect("key" in inputs[0]!).toBe(false);
  });
});
