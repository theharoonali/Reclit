import { describe, expect, it } from "bun:test";
import {
  MAX_PIE_SLICES,
  profileColumns,
  type VerifyCard,
  type VerifyIssue,
  verifyDashboard,
  verifyLayout,
  type WidgetQuery,
} from "../src/index";
import { sheet } from "./support/sheet";

/**
 * Twenty-four orders: an id, three regions, three long-named channels, a
 * distinct revenue per row, a constant quantity, a month per row, a year and
 * a column nobody filled. Profiled, the roles come out identifier, category,
 * category, measure, measure, time, year, measure.
 */
const ORDERS = sheet(
  [
    { name: "Order ID", type: "number" },
    { name: "Region", type: "string" },
    { name: "Channel", type: "string" },
    { name: "Revenue", type: "number" },
    { name: "Qty", type: "number" },
    { name: "Signed", type: "date" },
    { name: "Year", type: "number" },
    { name: "Nothing", type: "number" },
  ],
  Array.from({ length: 24 }, (_, index) => ({
    "Order ID": index + 1,
    Region: ["North", "South", "West"][index % 3],
    Channel: ["Enterprise direct sales", "Partner marketplace", "Self-serve"][
      index % 3
    ],
    Revenue: 100 + index * 37,
    Qty: 2,
    Signed: `2026-${String((index % 12) + 1).padStart(2, "0")}-10T00:00:00.000Z`,
    Year: 2026,
  })),
);
const PROFILE = profileColumns(ORDERS);

const query = (partial: Partial<WidgetQuery>): WidgetQuery => ({
  filters: [],
  groupBy: null,
  series: [{ key: "rev", label: "Revenue", formula: "SUM({Revenue})" }],
  ...partial,
});

/** A card over the defaults; `query` is a partial over `query()`'s. */
type CardPatch = Partial<Omit<VerifyCard, "query">> & {
  query?: Partial<WidgetQuery>;
};

const card = (partial: CardPatch): VerifyCard => ({
  name: "Card",
  type: "bar",
  variant: "default",
  column: 6,
  ...partial,
  query: query(partial.query ?? {}),
});

const stat = (formula: string, partial: CardPatch = {}) =>
  card({
    name: "Stat",
    type: "stat",
    column: 6,
    ...partial,
    query: { series: [{ key: "n", label: "N", formula }] },
  });

const byRegion = (partial: CardPatch = {}) =>
  card({
    name: "By region",
    ...partial,
    query: { groupBy: { column: "Region", bucket: "none" }, ...partial.query },
  });

const verify = (cards: VerifyCard[]): VerifyIssue[] =>
  verifyDashboard(cards, ORDERS, PROFILE);

const codes = (cards: VerifyCard[]) => verify(cards).map((i) => i.code);

describe("verifyDashboard", () => {
  it("profiles the fixture as the checks expect", () => {
    expect(PROFILE.map((column) => column.role)).toEqual([
      "identifier",
      "category",
      "category",
      "measure",
      "measure",
      "time",
      "year",
      "measure",
    ]);
  });

  it("passes a clean dashboard", () => {
    expect(
      verify([
        stat("COUNT()"),
        byRegion(),
        card({
          name: "Rows",
          type: "table",
          column: 12,
          query: {
            series: [{ key: "region", label: "Region", formula: "{Region}" }],
          },
        }),
      ]),
    ).toEqual([]);
  });

  it("QUERY_INVALID: a card the validator rejects, and nothing else about it", () => {
    const issues = verify([
      card({
        name: "Broken",
        query: { groupBy: { column: "Nope", bucket: "none" } },
      }),
    ]);
    expect(issues).toEqual([
      {
        code: "QUERY_INVALID",
        severity: "error",
        cardIndex: 0,
        cardName: "Broken",
        message: expect.stringContaining('"Nope"'),
        detail: 'Column "Nope" is not in the sheet',
      },
    ]);
  });

  it("EMPTY_RESULT: a filter that matches no row", () => {
    const issues = verify([
      byRegion({
        query: { filters: [{ column: "Region", op: "eq", value: "Nowhere" }] },
      }),
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ code: "EMPTY_RESULT", severity: "error" }),
    ]);
  });

  it("SINGLE_GROUP: a chart with one bar", () => {
    expect(
      codes([
        byRegion({
          query: { filters: [{ column: "Region", op: "eq", value: "North" }] },
        }),
      ]),
    ).toEqual(["SINGLE_GROUP"]);
  });

  it("ALL_NULL: every figure blank, on a stat and on a chart", () => {
    expect(codes([stat("AVG({Nothing})")])).toEqual(["ALL_NULL"]);
    expect(
      codes([
        byRegion({
          query: {
            series: [{ key: "n", label: "N", formula: "AVG({Nothing})" }],
          },
        }),
      ]),
    ).toEqual(["ALL_NULL"]);
  });

  it("TOO_MANY_SLICES: a pie or radial over the slice cap, a radar over the axis cap", () => {
    const byOrder = {
      groupBy: { column: "Order ID", bucket: "none" as const },
    };
    const pie = verify([
      card({ name: "Pie", type: "pie", variant: "donut", query: byOrder }),
    ]);
    expect(pie).toEqual([
      expect.objectContaining({
        code: "TOO_MANY_SLICES",
        severity: "error",
        message: expect.stringContaining(`${MAX_PIE_SLICES}`),
      }),
    ]);
    expect(codes([card({ type: "radial", query: byOrder })])).toEqual([
      "TOO_MANY_SLICES",
    ]);
    expect(codes([card({ type: "radar", query: byOrder })])).toEqual([
      "TOO_MANY_SLICES",
    ]);
    expect(
      codes([card({ type: "radar", query: { ...byOrder, limit: 8 } })]),
    ).toEqual([]);
  });

  it("TOO_MANY_CATEGORIES: the cap follows the card's width", () => {
    const byOrder = {
      groupBy: { column: "Order ID", bucket: "none" as const },
    };
    expect(verify([card({ column: 6, query: byOrder })])).toEqual([
      expect.objectContaining({
        code: "TOO_MANY_CATEGORIES",
        severity: "warn",
      }),
    ]);
    expect(codes([card({ column: 12, query: byOrder })])).toEqual([
      "TOO_MANY_CATEGORIES",
    ]);
    expect(
      codes([card({ column: 12, query: { ...byOrder, limit: 16 } })]),
    ).toEqual([]);
    expect(
      codes([card({ column: 6, query: { ...byOrder, limit: 8 } })]),
    ).toEqual([]);
  });

  it("LONG_LABELS: on a labelled x-axis, not on a horizontal bar", () => {
    const byChannel = {
      groupBy: { column: "Channel", bucket: "none" as const },
    };
    expect(verify([card({ type: "line", query: byChannel })])).toEqual([
      expect.objectContaining({
        code: "LONG_LABELS",
        severity: "warn",
        detail: "Enterprise direct sales",
      }),
    ]);
    expect(codes([card({ variant: "horizontal", query: byChannel })])).toEqual(
      [],
    );
  });

  it("CONSTANT_SERIES: a series that is the same in every group", () => {
    const issues = verify([
      byRegion({
        query: {
          series: [
            { key: "rev", label: "Revenue", formula: "SUM({Revenue})" },
            { key: "qty", label: "Quantity", formula: "SUM({Qty})" },
          ],
        },
      }),
    ]);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "CONSTANT_SERIES",
        severity: "warn",
        detail: "Quantity",
      }),
    ]);
  });

  it("NON_MEASURE_AGGREGATE: SUM/AVG/MIN/MAX over an id, year, date or text column", () => {
    const issues = verify([stat("SUM({Order ID})")]);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "NON_MEASURE_AGGREGATE",
        severity: "error",
        detail: 'SUM({Order ID}): "Order ID" is an identifier column',
      }),
    ]);
    expect(codes([stat("AVG({Year})")])).toEqual(["NON_MEASURE_AGGREGATE"]);
    expect(codes([stat("MIN({Signed})")])).toEqual(["NON_MEASURE_AGGREGATE"]);
    expect(
      codes([
        card({
          type: "stat",
          query: { compare: { formula: "MAX({Year})", label: "vs" } },
        }),
      ]),
    ).toEqual(["NON_MEASURE_AGGREGATE"]);
    expect(codes([stat("COUNT_DISTINCT({Year})")])).toEqual([]);
  });

  it("ID_COUNT_STAT: a lone COUNT of the id column", () => {
    expect(verify([stat("COUNT({Order ID})")])).toEqual([
      expect.objectContaining({
        code: "ID_COUNT_STAT",
        severity: "error",
        detail: "Order ID",
      }),
    ]);
    expect(codes([stat("COUNT_DISTINCT({Order ID})")])).toEqual([
      "ID_COUNT_STAT",
    ]);
    expect(codes([stat("COUNT({Region})")])).toEqual([]);
    expect(
      codes([
        card({
          type: "stat",
          query: {
            series: [
              { key: "n", label: "N", formula: "COUNT({Order ID})" },
              { key: "rev", label: "Revenue", formula: "SUM({Revenue})" },
            ],
          },
        }),
      ]),
    ).toEqual([]);
  });

  it("DUPLICATE_CARD: the same query again, or the same groupBy and formulas", () => {
    const issues = verify([
      byRegion({ name: "First" }),
      byRegion({
        name: "Same again",
        query: {
          series: [{ key: "r", label: "R", formula: " sum({revenue}) " }],
        },
      }),
      byRegion({
        name: "Filtered pie",
        type: "pie",
        variant: "donut",
        query: { filters: [{ column: "Region", op: "neq", value: "West" }] },
      }),
      byRegion({
        name: "Other measure",
        query: {
          series: [{ key: "avg", label: "Avg", formula: "AVG({Revenue})" }],
        },
      }),
    ]);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "DUPLICATE_CARD",
        severity: "error",
        cardIndex: 1,
        cardName: "Same again",
        detail: "First",
      }),
      expect.objectContaining({
        code: "DUPLICATE_CARD",
        cardIndex: 2,
        cardName: "Filtered pie",
        detail: "First",
      }),
    ]);
  });

  it("DUPLICATE_CARD: never against an invalid card", () => {
    expect(
      codes([
        card({
          name: "Broken",
          query: { groupBy: { column: "Nope", bucket: "none" } },
        }),
        byRegion(),
      ]),
    ).toEqual(["QUERY_INVALID"]);
  });
});

describe("verifyLayout", () => {
  const slot = (row: number, sort: number, column: number) => ({
    row,
    sort,
    column,
  });

  it("flags every row that leaves columns empty", () => {
    expect(
      verifyLayout([
        slot(0, 0, 6),
        slot(1, 0, 12),
        slot(2, 0, 4),
        slot(2, 1, 4),
      ]),
    ).toEqual([
      {
        code: "ROW_UNDERFILLED",
        row: 0,
        message: "row 0 fills 6 of 12 columns",
      },
      {
        code: "ROW_UNDERFILLED",
        row: 2,
        message: "row 2 fills 8 of 12 columns",
      },
    ]);
  });

  it("passes full rows", () => {
    expect(
      verifyLayout([slot(0, 0, 6), slot(0, 1, 6), slot(1, 0, 12)]),
    ).toEqual([]);
    expect(verifyLayout([])).toEqual([]);
  });

  it("reports the grid rule first", () => {
    expect(verifyLayout([slot(0, 0, 8), slot(0, 1, 5)])).toEqual([
      expect.objectContaining({ code: "ROW_OVERFLOW", row: 0 }),
    ]);
  });
});
