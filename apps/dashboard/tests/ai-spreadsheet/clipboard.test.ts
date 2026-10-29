import { describe, expect, test } from "bun:test";
import { parseTsv, selectionToTsv } from "@/lib/ai-spreadsheet/clipboard";
import {
  cellKey,
  type SheetColumn,
  type SheetModel,
} from "@/lib/ai-spreadsheet/types";

const PLAIN = { node: null, prompt: null } as const;
const COLUMNS: SheetColumn[] = [
  { ...PLAIN, id: "col.0", name: "Name", type: "string" },
  { ...PLAIN, id: "col.1", name: "Age", type: "number" },
  { ...PLAIN, id: "col.2", name: "Data", type: "json" },
];

function model(cells: [number, string, unknown][]): SheetModel {
  return {
    sheetId: "sheet_1",
    sheetName: "Test",
    rowCount: 100,
    columns: COLUMNS,
    cells: new Map(
      cells.map(([row, columnId, value]) => [
        cellKey(row, columnId),
        value as never,
      ]),
    ),
    rowIds: new Map(cells.map(([row]) => [row, `row.${row}`])),
    nextColumnIndex: 3,
  };
}

describe("selectionToTsv", () => {
  test("serialises the rectangle in display order, blanks as empty", () => {
    const tsv = selectionToTsv(
      model([
        [0, "col.0", "Ada"],
        [0, "col.1", 36],
        [1, "col.0", "Grace"],
      ]),
      { rowFirst: 0, rowLast: 1, colFirst: 0, colLast: 1 },
    );
    expect(tsv).toBe("Ada\t36\nGrace\t");
  });

  test("quotes cells holding tabs, newlines or quotes, and JSON objects stringify", () => {
    const tsv = selectionToTsv(
      model([
        [0, "col.0", "two\nlines"],
        [0, "col.2", { a: 1 }],
      ]),
      { rowFirst: 0, rowLast: 0, colFirst: 0, colLast: 2 },
    );
    expect(tsv).toBe('"two\nlines"\t\t"{""a"":1}"');
  });

  test("clamps a huge virtual selection to the stored rows", () => {
    const tsv = selectionToTsv(model([[2, "col.0", "last stored"]]), {
      rowFirst: 0,
      rowLast: 4_999_999,
      colFirst: 0,
      colLast: 0,
    });
    expect(tsv).toBe("\n\nlast stored");
  });
});

describe("parseTsv", () => {
  test("splits rows on \\n and \\r\\n, cells on tabs", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  test("a trailing newline adds no blank row", () => {
    expect(parseTsv("a\tb\n")).toEqual([["a", "b"]]);
  });

  test("unescapes quoted cells with embedded breaks and doubled quotes", () => {
    expect(parseTsv('"two\nlines"\t"say ""hi"""\tplain')).toEqual([
      ["two\nlines", 'say "hi"', "plain"],
    ]);
  });

  test("a lone value is a one-cell grid", () => {
    expect(parseTsv("hello")).toEqual([["hello"]]);
  });

  test("round-trips what selectionToTsv wrote", () => {
    const tsv = selectionToTsv(
      model([
        [0, "col.0", "two\nlines"],
        [0, "col.1", 7],
        [1, "col.0", 'say "hi"'],
      ]),
      { rowFirst: 0, rowLast: 1, colFirst: 0, colLast: 1 },
    ) as string;
    expect(parseTsv(tsv)).toEqual([
      ["two\nlines", "7"],
      ['say "hi"', ""],
    ]);
  });
});
