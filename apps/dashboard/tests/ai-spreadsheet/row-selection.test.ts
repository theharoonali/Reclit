import { describe, expect, test } from "bun:test";
import {
  mergeRowRanges,
  rowCountOf,
  rowRangeAddresses,
  selectAllState,
  selectedRowRanges,
  storedRowBounds,
  storedRowsIn,
} from "@/lib/ai-spreadsheet/row-selection";
import type {
  CellAddress,
  SelectionRect,
  SheetModel,
} from "@/lib/ai-spreadsheet/types";

const PLAIN = { node: null, prompt: null } as const;

/** Three columns; `rowIds` for stored rows, `cellRows` for rows with a cell. */
const model = (rowIds: number[], cellRows: number[] = []): SheetModel => ({
  sheetId: "sheet_1",
  sheetName: "Sheet",
  rowCount: rowIds.length,
  columns: [
    { ...PLAIN, id: "col.0", name: "Name", type: "string" },
    { ...PLAIN, id: "col.1", name: "Age", type: "number" },
    { ...PLAIN, id: "col.2", name: "Active", type: "boolean" },
  ],
  cells: new Map(cellRows.map((row) => [`${row}:col.0`, "x"])),
  rowIds: new Map(rowIds.map((row) => [row, `row.${row}`])),
  nextColumnIndex: 3,
});

const at = (row: number, col: number): CellAddress => ({ row, col });
/** A whole-row area in the three-column model. */
const rowArea = (first: number, last: number): SelectionRect => ({
  rowFirst: first,
  rowLast: last,
  colFirst: 0,
  colLast: 2,
});
const selection = (
  anchor: CellAddress | null,
  active: CellAddress | null,
  areas: SelectionRect[] = [],
) => ({ anchor, active, areas });

describe("rowRangeAddresses", () => {
  test("spans every column, with the active cell in the first so typing edits it", () => {
    expect(rowRangeAddresses(2, 5, 3)).toEqual({
      anchor: at(2, 2),
      active: at(5, 0),
    });
  });
});

describe("mergeRowRanges", () => {
  test("folds overlapping and touching ranges, ascending", () => {
    expect(
      mergeRowRanges([
        { first: 5, last: 6 },
        { first: 0, last: 1 },
        { first: 2, last: 3 },
        { first: 9, last: 9 },
        { first: 5, last: 5 },
      ]),
    ).toEqual([
      { first: 0, last: 3 },
      { first: 5, last: 6 },
      { first: 9, last: 9 },
    ]);
  });
});

describe("selectedRowRanges", () => {
  test("is the rows of a rectangle that spans every column, in either direction", () => {
    expect(selectedRowRanges(selection(at(4, 2), at(2, 0)), 3)).toEqual([
      { first: 2, last: 4 },
    ]);
    expect(selectedRowRanges(selection(at(2, 0), at(4, 2)), 3)).toEqual([
      { first: 2, last: 4 },
    ]);
  });

  test("is null when any area leaves a column out", () => {
    expect(selectedRowRanges(selection(at(2, 0), at(4, 1)), 3)).toBeNull();
    expect(selectedRowRanges(selection(at(2, 1), at(4, 2)), 3)).toBeNull();
    expect(
      selectedRowRanges(
        selection(at(2, 2), at(2, 0), [
          { rowFirst: 0, rowLast: 0, colFirst: 1, colLast: 1 },
        ]),
        3,
      ),
    ).toBeNull();
  });

  test("is null without a selection, and without columns", () => {
    expect(selectedRowRanges(selection(null, null), 3)).toBeNull();
    expect(selectedRowRanges(selection(at(0, 0), at(0, 0)), 0)).toBeNull();
  });

  test("a single cell is a row selection in a one-column sheet", () => {
    expect(selectedRowRanges(selection(at(3, 0), at(3, 0)), 1)).toEqual([
      { first: 3, last: 3 },
    ]);
  });

  test("merges picked rows into ascending ranges", () => {
    const ranges = selectedRowRanges(
      selection(at(9, 2), at(9, 0), [
        rowArea(5, 6),
        rowArea(0, 1),
        rowArea(2, 3),
      ]),
      3,
    );
    expect(ranges).toEqual([
      { first: 0, last: 3 },
      { first: 5, last: 6 },
      { first: 9, last: 9 },
    ]);
    expect(rowCountOf(ranges ?? [])).toBe(7);
  });
});

describe("storedRowBounds", () => {
  test("spans stored rows and rows that only have a cell", () => {
    expect(storedRowBounds(model([2, 3], [7]))).toEqual({ first: 2, last: 7 });
  });

  test("is null for a sheet with nothing stored", () => {
    expect(storedRowBounds(model([]))).toBeNull();
  });
});

describe("storedRowsIn", () => {
  test("keeps only the stored rows inside the ranges, ascending", () => {
    const stored = model([9, 1, 4, 12], [6]);
    expect(storedRowsIn(stored, [{ first: 2, last: 8 }])).toEqual([4, 6]);
    expect(
      storedRowsIn(stored, [
        { first: 2, last: 8 },
        { first: 12, last: 12 },
      ]),
    ).toEqual([4, 6, 12]);
  });
});

describe("selectAllState", () => {
  const stored = model([1, 2, 5]);

  test("is none without a whole-row selection, however many rows a rectangle covers", () => {
    expect(selectAllState(selection(null, null), stored, 3)).toBe("none");
    expect(selectAllState(selection(at(0, 0), at(9, 1)), stored, 3)).toBe(
      "none",
    );
  });

  test("is some for a whole-row selection that misses a stored row", () => {
    expect(selectAllState(selection(at(1, 2), at(2, 0)), stored, 3)).toBe(
      "some",
    );
    expect(
      selectAllState(selection(at(5, 2), at(5, 0), [rowArea(1, 1)]), stored, 3),
    ).toBe("some");
  });

  test("is all once the rows cover every stored row, in one area or several", () => {
    expect(selectAllState(selection(at(5, 2), at(1, 0)), stored, 3)).toBe(
      "all",
    );
    expect(selectAllState(selection(at(9, 2), at(0, 0)), stored, 3)).toBe(
      "all",
    );
    expect(
      selectAllState(selection(at(5, 2), at(5, 0), [rowArea(1, 2)]), stored, 3),
    ).toBe("all");
  });

  test("is none on a sheet with nothing stored — there is nothing for all to mean", () => {
    expect(selectAllState(selection(at(0, 2), at(0, 0)), model([]), 3)).toBe(
      "none",
    );
  });
});
