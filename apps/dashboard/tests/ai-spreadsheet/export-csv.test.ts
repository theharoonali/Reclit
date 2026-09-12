import { describe, expect, test } from "bun:test";
import {
  csvCellText,
  csvField,
  sheetToCsv,
} from "@/lib/ai-spreadsheet/export-csv";
import type { CellValue, SheetModel } from "@/lib/ai-spreadsheet/types";
import { cellKey } from "@/lib/ai-spreadsheet/types";

const column = (id: string, name: string) => ({
  id,
  name,
  type: "string" as const,
  node: null,
  prompt: null,
});

function makeModel(args: {
  columns: { id: string; name: string }[];
  cells?: [number, string, CellValue][];
  rowIds?: number[];
}): SheetModel {
  const cells = new Map<string, CellValue>();
  for (const [row, columnId, value] of args.cells ?? []) {
    cells.set(cellKey(row, columnId), value);
  }
  return {
    sheetId: "sheet_123",
    sheetName: "Customers",
    rowCount: 5_000_000,
    columns: args.columns.map((c) => column(c.id, c.name)),
    cells,
    rowIds: new Map((args.rowIds ?? []).map((row) => [row, `row.${row}`])),
    nextColumnIndex: args.columns.length,
  };
}

describe("csvField", () => {
  test("passes plain text through unquoted", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("")).toBe("");
  });

  test("quotes a field holding a comma", () => {
    expect(csvField("a,b")).toBe('"a,b"');
  });

  test("quotes and doubles embedded quotes", () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  test("quotes line breaks, CR and LF alike", () => {
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField("a\rb")).toBe('"a\rb"');
  });
});

describe("csvCellText", () => {
  test("a blank cell is the empty string", () => {
    expect(csvCellText(null)).toBe("");
  });

  test("numbers and booleans export raw, not localised", () => {
    expect(csvCellText(1234.5)).toBe("1234.5");
    expect(csvCellText(false)).toBe("false");
  });

  test("JSON objects are stringified, not dropped", () => {
    expect(csvCellText({ a: 1 })).toBe('{"a":1}');
  });
});

describe("sheetToCsv", () => {
  test("header row of column names, then stored rows in ascending index", () => {
    const csv = sheetToCsv(
      makeModel({
        columns: [
          { id: "col.0", name: "Name" },
          { id: "col.1", name: "Age" },
        ],
        cells: [
          [7, "col.0", "Late"],
          [0, "col.0", "Early"],
          [0, "col.1", 26],
        ],
      }),
    );
    expect(csv).toBe("Name,Age\r\nEarly,26\r\nLate,");
  });

  test("rows are the union of stored rows and rows holding cells", () => {
    const csv = sheetToCsv(
      makeModel({
        columns: [{ id: "col.0", name: "Name" }],
        cells: [[2, "col.0", "cell-only"]],
        rowIds: [0],
      }),
    );
    // Row 0 exists but is blank; the gap at row 1 is skipped, not emitted.
    expect(csv).toBe("Name\r\n\r\ncell-only");
  });

  test("column names and values needing quotes are escaped", () => {
    const csv = sheetToCsv(
      makeModel({
        columns: [{ id: "col.0", name: "First, Last" }],
        cells: [[0, "col.0", 'a "quoted", value']],
      }),
    );
    expect(csv).toBe('"First, Last"\r\n"a ""quoted"", value"');
  });

  test("a gapped column set exports only the columns that exist", () => {
    const csv = sheetToCsv(
      makeModel({
        columns: [
          { id: "col.0", name: "Kept" },
          { id: "col.2", name: "AlsoKept" },
        ],
        cells: [
          [0, "col.0", "a"],
          [0, "col.2", "b"],
          // A cell of the deleted column lingering in the map is not exported.
          [0, "col.1", "ghost"],
        ],
      }),
    );
    expect(csv).toBe("Kept,AlsoKept\r\na,b");
  });
});
