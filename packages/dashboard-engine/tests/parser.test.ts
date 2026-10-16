import { describe, expect, it } from "bun:test";
import {
  evaluateRow,
  type FormulaSyntaxError,
  parseFormula,
  tryParseFormula,
} from "../src/index";
import { scope } from "./support/sheet";

const run = (
  text: string,
  cells: Record<string, number | string | null> = {},
) => evaluateRow(parseFormula(text).ast, scope(cells));

function failure(text: string): FormulaSyntaxError {
  const result = tryParseFormula(text);
  if (result.ok) throw new Error(`expected "${text}" to fail`);
  return result.error;
}

describe("parseFormula", () => {
  it("applies arithmetic precedence and parentheses", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("10 - 4 - 3")).toBe(3);
    expect(run("2 * 3 % 4")).toBe(2);
  });

  it("parses unary minus and plus", () => {
    expect(run("-{A} + 5", { A: 2 })).toBe(3);
    expect(run("+3")).toBe(3);
    expect(run("--3")).toBe(3);
  });

  it("binds comparison below arithmetic and logic below comparison", () => {
    expect(run("1 + 1 = 2 AND 3 > 2")).toBe(true);
    expect(run("NOT 1 = 2 OR FALSE")).toBe(true);
    expect(run("1 = 2 OR 2 = 2 AND 3 = 3")).toBe(true);
    expect(run("{A} <> 'x'", { A: "y" })).toBe(true);
  });

  it("reads TRUE, FALSE and NULL as keywords", () => {
    expect(run("TRUE")).toBe(true);
    expect(run("false")).toBe(false);
    expect(run("NULL")).toBeNull();
  });

  it("collects the columns a formula reads, distinct and in order of first use", () => {
    const parsed = parseFormula("{B} + {a} * {A} - {b}");
    expect(parsed.columns).toEqual(["B", "a"]);
    expect(parsed.isAggregate).toBe(false);
  });

  it("marks a formula with an aggregate call", () => {
    const parsed = parseFormula("SUM({Revenue}) - SUM({Cost})");
    expect(parsed.isAggregate).toBe(true);
    expect(parsed.columns).toEqual(["Revenue", "Cost"]);
    expect(parseFormula("COUNT()").isAggregate).toBe(true);
  });

  it("rejects a column reference beside an aggregate", () => {
    const error = failure("SUM({A}) / {B}");
    expect(error.code).toBe("REF_OUTSIDE_AGGREGATE");
    expect(error.position).toBe(11);
  });

  it("rejects nested aggregates", () => {
    expect(failure("SUM(AVG({A}))").code).toBe("NESTED_AGGREGATE");
  });

  it("checks arity", () => {
    expect(failure("SUM()").code).toBe("ARITY");
    expect(failure("SUM({A}, {B})").code).toBe("ARITY");
    expect(failure("IF({A})").code).toBe("ARITY");
    expect(failure("ROUND(1, 2, 3)").code).toBe("ARITY");
    expect(parseFormula("COALESCE({A}, {B}, 0)").columns).toEqual(["A", "B"]);
  });

  it("rejects unknown functions and bare identifiers", () => {
    expect(failure("FOO(1)").code).toBe("UNKNOWN_FUNCTION");
    const bare = failure("Revenue + 1");
    expect(bare.code).toBe("UNEXPECTED_TOKEN");
    expect(bare.message).toContain("{REVENUE}");
  });

  it("rejects an empty or trailing-garbage formula", () => {
    expect(failure("").code).toBe("UNEXPECTED_END");
    expect(failure("1 +").code).toBe("UNEXPECTED_END");
    expect(failure("1 2").code).toBe("UNEXPECTED_TOKEN");
    expect(failure("(1 + 2").code).toBe("UNEXPECTED_END");
  });

  it("tryParseFormula wraps the error instead of throwing", () => {
    const result = tryParseFormula("1 +");
    expect(result.ok).toBe(false);
    expect(tryParseFormula("1 + 1").ok).toBe(true);
  });
});
