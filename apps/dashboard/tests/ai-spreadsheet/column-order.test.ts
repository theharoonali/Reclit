import { describe, expect, test } from "bun:test";
import { dropTarget, previewOrder } from "@/lib/ai-spreadsheet/column-order";
import type { SheetColumn } from "@/lib/ai-spreadsheet/types";

const column = (id: string): SheetColumn => ({
  id,
  name: id,
  type: "string",
  node: null,
  prompt: null,
});

const COLUMNS = ["a", "b", "c", "d"].map(column);
const ids = (columns: SheetColumn[]) => columns.map((c) => c.id);

describe("dropTarget", () => {
  // Lifting the column out first shifts every gap to its right one left.
  test("accounts for the column being lifted out", () => {
    expect(dropTarget(3, 1)).toBe(1);
    expect(dropTarget(0, 3)).toBe(2);
  });

  test("treats both gaps beside a column as staying put", () => {
    expect(dropTarget(1, 1)).toBe(1);
    expect(dropTarget(1, 2)).toBe(1);
  });
});

describe("previewOrder", () => {
  // The worked example from the plan: A B C D, move D to 1 -> A D B C.
  test("moves a column left", () => {
    expect(ids(previewOrder(COLUMNS, 3, 1))).toEqual(["a", "d", "b", "c"]);
  });

  test("moves a column right", () => {
    expect(ids(previewOrder(COLUMNS, 0, 2))).toEqual(["b", "c", "a", "d"]);
  });

  test("returns the same array for a no-op, so paint can skip the copy", () => {
    expect(previewOrder(COLUMNS, 2, 2)).toBe(COLUMNS);
  });

  // A paint is not the place to throw.
  test("passes the order through unchanged when either end is out of range", () => {
    expect(previewOrder(COLUMNS, -1, 0)).toBe(COLUMNS);
    expect(previewOrder(COLUMNS, 0, 9)).toBe(COLUMNS);
  });

  test("never adds or drops a column", () => {
    expect(ids(previewOrder(COLUMNS, 1, 3)).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
