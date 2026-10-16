import { describe, expect, it } from "bun:test";
import { checkLayout, toRows } from "../src/index";

const widget = (id: string, row: number, sort: number, column = 4) => ({
  id,
  row,
  sort,
  column,
});

describe("toRows", () => {
  it("orders rows ascending and widgets by sort", () => {
    const rows = toRows([
      widget("c", 1, 0),
      widget("b", 0, 2),
      widget("a", 0, 1),
    ]);
    expect(
      rows.map(({ row, widgets }) => [row, widgets.map((w) => w.id)]),
    ).toEqual([
      [0, ["a", "b"]],
      [1, ["c"]],
    ]);
  });

  it("returns no rows for no widgets", () => {
    expect(toRows([])).toEqual([]);
  });
});

describe("checkLayout", () => {
  it("accepts a row that fills fewer than 12 columns", () => {
    expect(checkLayout([widget("a", 0, 0, 8)])).toBeNull();
    expect(
      checkLayout([widget("a", 0, 0, 6), widget("b", 0, 1, 6)]),
    ).toBeNull();
  });

  it("rejects a row whose spans exceed 12 columns", () => {
    const issue = checkLayout([widget("a", 0, 0, 8), widget("b", 0, 1, 5)]);
    expect(issue).toMatchObject({ code: "ROW_OVERFLOW", row: 0, index: 1 });
  });

  it("rejects two widgets in the same row and sort slot", () => {
    const issue = checkLayout([widget("a", 2, 0), widget("b", 2, 0)]);
    expect(issue).toMatchObject({ code: "DUPLICATE_SLOT", row: 2, index: 1 });
  });
});
