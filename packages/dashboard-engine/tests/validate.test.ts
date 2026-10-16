import { describe, expect, it } from "bun:test";
import {
  type QueryIssueCode,
  validateWidget,
  type WidgetQuery,
  type WidgetSpec,
} from "../src/index";
import { COLUMNS } from "./support/sheet";

const columns = COLUMNS.map(({ name, type }) => ({ name, type }));

const query = (partial: Partial<WidgetQuery>): WidgetQuery => ({
  filters: [],
  groupBy: null,
  series: [{ key: "rev", label: "Revenue", formula: "SUM({Revenue})" }],
  ...partial,
});

const codes = (spec: WidgetSpec): QueryIssueCode[] =>
  validateWidget(spec, columns).map((issue) => issue.code);

const bar = (partial: Partial<WidgetQuery> = {}): WidgetSpec => ({
  type: "bar",
  variant: "default",
  query: query({ groupBy: { column: "Region", bucket: "none" }, ...partial }),
});

const stat = (partial: Partial<WidgetQuery> = {}): WidgetSpec => ({
  type: "stat",
  variant: "default",
  query: query(partial),
});

describe("validateWidget", () => {
  it("accepts a well-formed bar and stat", () => {
    expect(codes(bar())).toEqual([]);
    expect(codes(stat())).toEqual([]);
  });

  it("checks the variant against the type", () => {
    expect(codes({ ...bar(), variant: "donut" })).toEqual(["VARIANT"]);
  });

  it("requires groupBy on charts and forbids it on single-record widgets", () => {
    expect(codes({ ...bar(), query: query({ groupBy: null }) })).toEqual([
      "GROUP_BY_REQUIRED",
    ]);
    expect(
      codes(stat({ groupBy: { column: "Region", bucket: "none" } })),
    ).toEqual(["GROUP_BY_FORBIDDEN"]);
    expect(
      codes({
        type: "radial",
        variant: "stacked",
        query: query({ groupBy: { column: "Region", bucket: "none" } }),
      }),
    ).toEqual(["GROUP_BY_FORBIDDEN"]);
    expect(
      codes({ type: "radial", variant: "default", query: query({}) }),
    ).toEqual(["GROUP_BY_REQUIRED"]);
    expect(
      codes({
        type: "table",
        variant: "default",
        query: query({
          series: [{ key: "s", label: "S", formula: "{Seller}" }],
        }),
      }),
    ).toEqual([]);
  });

  it("reports unknown columns everywhere they can appear", () => {
    const issues = validateWidget(
      bar({
        filters: [{ column: "Nope", op: "eq", value: 1 }],
        groupBy: { column: "Missing", bucket: "none" },
        series: [{ key: "x", label: "x", formula: "SUM({Gone})" }],
      }),
      columns,
    );
    expect(issues.map((issue) => [issue.code, issue.detail])).toEqual([
      ["UNKNOWN_COLUMN", "Nope"],
      ["UNKNOWN_COLUMN", "Missing"],
      ["UNKNOWN_COLUMN", "Gone"],
    ]);
    expect(issues[2]?.path).toEqual(["series", 0, "formula"]);
  });

  it("matches column names case-insensitively", () => {
    expect(
      codes(
        bar({
          groupBy: { column: "region", bucket: "none" },
          series: [{ key: "r", label: "r", formula: "SUM({REVENUE})" }],
        }),
      ),
    ).toEqual([]);
  });

  it("allows buckets only on date columns", () => {
    expect(
      codes(bar({ groupBy: { column: "Signed", bucket: "month" } })),
    ).toEqual([]);
    expect(
      codes(bar({ groupBy: { column: "Region", bucket: "month" } })),
    ).toEqual(["BUCKET_NOT_DATE"]);
  });

  it("checks series counts per type and variant", () => {
    expect(codes(bar({ series: [] }))).toEqual(["SERIES_COUNT"]);
    expect(
      codes({
        type: "pie",
        variant: "default",
        query: query({
          groupBy: { column: "Region", bucket: "none" },
          series: [
            query({}).series[0]!,
            { key: "c", label: "c", formula: "SUM({Cost})" },
          ],
        }),
      }),
    ).toEqual(["SERIES_COUNT"]);
    expect(
      codes(
        stat({
          series: Array.from({ length: 5 }, (_, i) => ({
            key: `k${i}`,
            label: "k",
            formula: "COUNT()",
          })),
        }),
      ),
    ).toEqual(["SERIES_COUNT"]);
  });

  it("rejects bad, reserved and duplicate series keys", () => {
    expect(
      codes(
        stat({ series: [{ key: "my key", label: "x", formula: "COUNT()" }] }),
      ),
    ).toEqual(["SERIES_KEY"]);
    expect(
      codes(
        stat({ series: [{ key: "category", label: "x", formula: "COUNT()" }] }),
      ),
    ).toEqual(["SERIES_KEY"]);
    expect(
      codes(
        stat({
          series: [
            { key: "a", label: "x", formula: "COUNT()" },
            { key: "a", label: "y", formula: "COUNT()" },
          ],
        }),
      ),
    ).toEqual(["SERIES_KEY"]);
  });

  it("requires aggregates on grouped widgets and row-level formulas on a plain table", () => {
    expect(
      codes(bar({ series: [{ key: "r", label: "r", formula: "{Revenue}" }] })),
    ).toEqual(["AGGREGATE_REQUIRED"]);
    expect(
      codes(
        stat({ series: [{ key: "r", label: "r", formula: "{Revenue} * 2" }] }),
      ),
    ).toEqual(["AGGREGATE_REQUIRED"]);
    expect(
      codes({ type: "table", variant: "default", query: query({}) }),
    ).toEqual(["ROW_LEVEL_REQUIRED"]);
  });

  it("reports a formula that does not parse, with the parser's message", () => {
    const issues = validateWidget(
      stat({ series: [{ key: "r", label: "r", formula: "SUM({Revenue}" }] }),
      columns,
    );
    expect(issues[0]?.code).toBe("FORMULA_INVALID");
    expect(issues[0]?.detail).toContain("Expected");
  });

  it("allows splitBy on grouped charts with one series only", () => {
    expect(codes(bar({ splitBy: { column: "Seller" } }))).toEqual([]);
    expect(
      codes(
        bar({
          splitBy: { column: "Seller" },
          series: [
            query({}).series[0]!,
            { key: "c", label: "c", formula: "SUM({Cost})" },
          ],
        }),
      ),
    ).toEqual(["SERIES_COUNT"]);
    expect(codes(stat({ splitBy: { column: "Seller" } }))).toEqual([
      "SPLIT_BY_FORBIDDEN",
    ]);
    expect(
      codes({
        type: "pie",
        variant: "default",
        query: query({
          groupBy: { column: "Region", bucket: "none" },
          splitBy: { column: "Seller" },
        }),
      }),
    ).toEqual(["SPLIT_BY_FORBIDDEN"]);
    expect(
      codes(bar({ splitBy: { column: "Region", bucket: "year" } })),
    ).toEqual(["BUCKET_NOT_DATE"]);
  });

  it("checks sort.by and detailKey against the series", () => {
    expect(codes(bar({ sort: { by: "category", direction: "asc" } }))).toEqual(
      [],
    );
    expect(codes(bar({ sort: { by: "rev", direction: "desc" } }))).toEqual([]);
    expect(codes(bar({ sort: { by: "nope", direction: "desc" } }))).toEqual([
      "SORT_KEY",
    ]);
    expect(codes(bar({ sort: { by: "total", direction: "desc" } }))).toEqual([
      "SORT_KEY",
    ]);
    expect(
      codes(
        bar({
          splitBy: { column: "Seller" },
          sort: { by: "total", direction: "desc" },
        }),
      ),
    ).toEqual([]);
    expect(
      codes({
        type: "table",
        variant: "default",
        query: query({
          series: [
            {
              key: "name",
              label: "Name",
              formula: "{Seller}",
              kind: "person",
              detailKey: "region",
            },
            { key: "region", label: "Region", formula: "{Region}" },
          ],
        }),
      }),
    ).toEqual([]);
    expect(
      codes({
        type: "table",
        variant: "default",
        query: query({
          series: [
            {
              key: "name",
              label: "Name",
              formula: "{Seller}",
              kind: "person",
              detailKey: "name",
            },
          ],
        }),
      }),
    ).toEqual(["DETAIL_KEY"]);
  });

  it("allows compare on stat only and requires it to aggregate", () => {
    expect(
      codes(stat({ compare: { formula: "COUNT()", label: "x" } })),
    ).toEqual([]);
    expect(codes(bar({ compare: { formula: "COUNT()", label: "x" } }))).toEqual(
      ["COMPARE_FORBIDDEN"],
    );
    expect(
      codes(stat({ compare: { formula: "{Revenue}", label: "x" } })),
    ).toEqual(["AGGREGATE_REQUIRED"]);
    expect(
      codes(stat({ compare: { formula: "SUM({Nope})", label: "x" } })),
    ).toEqual(["UNKNOWN_COLUMN"]);
  });
});
