import { describe, expect, test } from "bun:test";
import { isColumnNameTaken } from "@/lib/ai-spreadsheet/column-names";

describe("isColumnNameTaken", () => {
  const others = ["Company", " Website "];

  test("matches another column's name trimmed and in any case", () => {
    expect(isColumnNameTaken("Company", others)).toBe(true);
    expect(isColumnNameTaken("  company ", others)).toBe(true);
    expect(isColumnNameTaken("WEBSITE", others)).toBe(true);
  });

  test("a new name, a partial match and a blank are free", () => {
    expect(isColumnNameTaken("Employees", others)).toBe(false);
    expect(isColumnNameTaken("Compan", others)).toBe(false);
    expect(isColumnNameTaken("   ", others)).toBe(false);
  });

  test("a column keeps its own name: it is not among the others", () => {
    expect(isColumnNameTaken("Company", ["Website"])).toBe(false);
  });
});
