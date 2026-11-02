import { describe, expect, it } from "bun:test";
import {
  checkLayout,
  packDashboard,
  placeWidget,
  placeWidgets,
  toRows,
  type WidgetType,
} from "../src/index";

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

describe("placeWidget", () => {
  it("starts an empty grid at the first slot", () => {
    expect(placeWidget([], 6)).toEqual({ row: 0, sort: 0 });
  });

  it("fills the first row with room before opening a new one", () => {
    const widgets = [widget("a", 0, 0, 3), widget("b", 1, 0, 12)];
    expect(placeWidget(widgets, 6)).toEqual({ row: 0, sort: 1 });
    expect(placeWidget(widgets, 9)).toEqual({ row: 0, sort: 1 });
    expect(placeWidget(widgets, 10)).toEqual({ row: 2, sort: 0 });
  });

  it("skips full rows and reads sparse row numbers in order", () => {
    const widgets = [
      widget("a", 0, 0, 12),
      widget("c", 4, 0, 4),
      widget("b", 2, 0, 6),
      widget("d", 2, 1, 6),
    ];
    expect(placeWidget(widgets, 6)).toEqual({ row: 4, sort: 1 });
    expect(placeWidget(widgets, 12)).toEqual({ row: 5, sort: 0 });
  });

  it("appends to a chosen row after its last card, whatever the width", () => {
    const widgets = [widget("a", 0, 0, 12), widget("b", 0, 3, 12)];
    expect(placeWidget(widgets, 6, 0)).toEqual({ row: 0, sort: 4 });
    expect(placeWidget(widgets, 6, 7)).toEqual({ row: 7, sort: 0 });
  });
});

describe("placeWidgets", () => {
  it("lays cards out in sequence, top-first", () => {
    expect(placeWidgets([3, 3, 3, 3, 6, 12, 6])).toEqual([
      { row: 0, sort: 0 },
      { row: 0, sort: 1 },
      { row: 0, sort: 2 },
      { row: 0, sort: 3 },
      { row: 1, sort: 0 },
      { row: 2, sort: 0 },
      { row: 1, sort: 1 },
    ]);
    expect(placeWidgets([])).toEqual([]);
  });
});

describe("packDashboard", () => {
  const card = (type: WidgetType, column = 6) => ({ type, column });
  const stats = (count: number) =>
    Array.from({ length: count }, () => card("stat"));
  const charts = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      card(index % 2 === 0 ? "bar" : "line"),
    );
  /** The widths per row, in row and sort order. */
  const widths = (packed: { row: number; sort: number; column: number }[]) =>
    toRows(packed).map((row) => row.widgets.map((w) => w.column));

  it("orders stats, charts, tables and fills every row", () => {
    const packed = packDashboard([card("table", 6), ...charts(2), ...stats(4)]);
    expect(packed.map((w) => w.type)).toEqual([
      "stat",
      "stat",
      "stat",
      "stat",
      "bar",
      "line",
      "table",
    ]);
    expect(widths(packed)).toEqual([[3, 3, 3, 3], [6, 6], [12]]);
    expect(packed.map(({ row, sort }) => [row, sort])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
      [1, 1],
      [2, 0],
    ]);
  });

  it("gives three stats a third each", () => {
    expect(widths(packDashboard(stats(3)))).toEqual([[4, 4, 4]]);
  });

  it("pairs a lone stat with the first chart", () => {
    expect(widths(packDashboard([...stats(1), ...charts(1)]))).toEqual([
      [6, 6],
    ]);
  });

  it("widens the last 6-wide chart when the halves are odd", () => {
    expect(widths(packDashboard([...stats(1), ...charts(2)]))).toEqual([
      [6, 6],
      [12],
    ]);
    expect(widths(packDashboard([...stats(2), ...charts(3)]))).toEqual([
      [6, 6],
      [6, 6],
      [12],
    ]);
  });

  it("keeps a chart that asks for the full row at 12", () => {
    expect(
      widths(packDashboard([card("bar", 12), card("line"), card("area")])),
    ).toEqual([[12], [6, 6]]);
  });

  it("widens a bar rather than a trailing pie", () => {
    const packed = packDashboard([card("bar"), card("bar"), card("pie")]);
    expect(packed.map((w) => [w.type, w.column, w.row])).toEqual([
      ["bar", 6, 0],
      ["bar", 12, 1],
      ["pie", 6, 0],
    ]);
  });

  it("packs nothing into nothing", () => {
    expect(packDashboard([])).toEqual([]);
  });
});
