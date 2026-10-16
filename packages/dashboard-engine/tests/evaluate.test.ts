import { describe, expect, it } from "bun:test";
import {
  evaluateAggregate,
  evaluateRow,
  parseFormula,
  type Value,
} from "../src/index";
import { scope } from "./support/sheet";

const row = (text: string, cells: Record<string, Value> = {}) =>
  evaluateRow(parseFormula(text).ast, scope(cells));

const group = (text: string, rows: Record<string, Value>[]) =>
  evaluateAggregate(parseFormula(text).ast, rows.map(scope));

const jan = new Date("2026-01-15T00:00:00.000Z");
const feb = new Date("2026-02-10T00:00:00.000Z");

describe("evaluateRow", () => {
  it("propagates null through arithmetic and division by zero", () => {
    expect(row("{A} + 1", { A: null })).toBeNull();
    expect(row("{A} + 1")).toBeNull();
    expect(row("1 / 0")).toBeNull();
    expect(row("1 % 0")).toBeNull();
    expect(row("7 % 3")).toBe(1);
  });

  it("coerces numeric strings and booleans", () => {
    expect(row('"5" * 2')).toBe(10);
    expect(row("TRUE + 1")).toBe(2);
    expect(row('"abc" * 2')).toBeNull();
    expect(row("-{A}", { A: "4" })).toBe(-4);
  });

  it("compares dates with string literals and strings with strings", () => {
    expect(row('{D} >= "2026-01-01"', { D: jan })).toBe(true);
    expect(row('{D} < "2026-01-01"', { D: jan })).toBe(false);
    expect(row('"b" > "a"')).toBe(true);
    expect(row('"10" < "9"')).toBe(true);
    expect(row('1 = "1"')).toBe(true);
    expect(row('"x" = 1')).toBe(false);
  });

  it("treats a comparison with null as null and NOT null as true", () => {
    expect(row("{A} = NULL", { A: 1 })).toBeNull();
    expect(row("{A} > 1")).toBeNull();
    expect(row("NOT {A}")).toBe(true);
    expect(row("{A} AND TRUE")).toBe(false);
    expect(row("{A} OR TRUE")).toBe(true);
  });

  it("evaluates the row functions", () => {
    expect(row('IF({A} > 1, "big", "small")', { A: 2 })).toBe("big");
    expect(row("IF({A} > 1, 1)", { A: 0 })).toBeNull();
    expect(row("ABS(-3)")).toBe(3);
    expect(row("ROUND(2.345, 2)")).toBe(2.35);
    expect(row("ROUND(2.5)")).toBe(3);
    expect(row("FLOOR(2.7)")).toBe(2);
    expect(row("CEIL(2.1)")).toBe(3);
    expect(row("COALESCE({A}, {B}, 0)", { B: 4 })).toBe(4);
    expect(row("COALESCE({A}, {B})")).toBeNull();
    expect(row('LEN("abcd")')).toBe(4);
    expect(row("LEN({A})")).toBeNull();
    expect(row('LOWER("AbC")')).toBe("abc");
    expect(row('UPPER("AbC")')).toBe("ABC");
    expect(row('TRIM("  x ")')).toBe("x");
  });

  it("folds an aggregate over no rows in row context", () => {
    expect(row("SUM({A})")).toBe(0);
    expect(row("AVG({A})")).toBeNull();
  });
});

describe("evaluateAggregate", () => {
  const rows = [
    { A: 1, B: 2 },
    { A: null, B: 3 },
    { A: "2", B: 4 },
    { A: 3, B: null },
  ];

  it("SUM skips blanks and coerces, and is 0 over nothing", () => {
    expect(group("SUM({A})", rows)).toBe(6);
    expect(group("SUM({A})", [])).toBe(0);
    expect(group("SUM({A} * {B})", rows)).toBe(2 + 8);
  });

  it("AVG, MIN and MAX ignore blanks and are null over nothing", () => {
    expect(group("AVG({A})", rows)).toBe(2);
    expect(group("MIN({B})", rows)).toBe(2);
    expect(group("MAX({B})", rows)).toBe(4);
    expect(group("AVG({A})", [])).toBeNull();
    expect(group("MIN({A})", [{ A: null }])).toBeNull();
  });

  it("MIN and MAX of dates stay dates", () => {
    const earliest = group("MIN({D})", [{ D: feb }, { D: jan }, { D: null }]);
    expect(earliest).toBeInstanceOf(Date);
    expect((earliest as Date).toISOString()).toBe(jan.toISOString());
    expect(
      (group("MAX({D})", [{ D: feb }, { D: jan }]) as Date).toISOString(),
    ).toBe(feb.toISOString());
  });

  it("COUNT() counts rows, COUNT(x) non-blank values", () => {
    expect(group("COUNT()", rows)).toBe(4);
    expect(group("COUNT({A})", rows)).toBe(3);
    expect(group("COUNT()", [])).toBe(0);
  });

  it("COUNT_DISTINCT keys by type and value, dates by their instant", () => {
    expect(
      group("COUNT_DISTINCT({A})", [
        { A: 1 },
        { A: "1" },
        { A: 1 },
        { A: null },
      ]),
    ).toBe(2);
    expect(
      group("COUNT_DISTINCT({D})", [
        { D: jan },
        { D: new Date(jan) },
        { D: feb },
      ]),
    ).toBe(2);
  });

  it("FIRST and LAST skip blanks in row order", () => {
    expect(group("FIRST({A})", rows)).toBe(1);
    expect(group("LAST({A})", rows)).toBe(3);
    expect(group("LAST({A})", [{ A: null }])).toBeNull();
  });

  it("combines aggregates arithmetically", () => {
    expect(group("SUM({B}) - SUM({A})", rows)).toBe(3);
    expect(group("SUM({A}) / COUNT() * 100", rows)).toBe(150);
    expect(group("SUM({A}) / SUM({C})", rows)).toBeNull();
  });

  it("aggregates a row-level expression per row", () => {
    expect(group("SUM(IF({B} > 2, {B}, 0))", rows)).toBe(7);
    expect(group("COUNT(IF({A} > 1, 1, NULL))", rows)).toBe(2);
  });
});
