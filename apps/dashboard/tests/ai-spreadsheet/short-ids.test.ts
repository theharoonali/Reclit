import { describe, expect, test } from "bun:test";
import {
  parseScopedCellId,
  parseShortColumnId,
  parseShortRowId,
} from "@/lib/ai-spreadsheet/short-ids";

describe("short ids", () => {
  test("row and column ids parse back to their index", () => {
    expect(parseShortRowId("row.42")).toBe(42);
    expect(parseShortColumnId("col.3")).toBe(3);
  });

  test("anything else is null", () => {
    expect(parseShortRowId("col.1")).toBeNull();
    expect(parseShortColumnId("row.1")).toBeNull();
    expect(parseShortRowId("row.x")).toBeNull();
  });
});

describe("scoped cell ids", () => {
  test("a run's cellId parses to its sheet, row and column", () => {
    expect(
      parseScopedCellId("8d2c3f10-1b2a-4c3d-9e8f-0a1b2c3d4e5f.cell.12.3"),
    ).toEqual({
      sheetId: "8d2c3f10-1b2a-4c3d-9e8f-0a1b2c3d4e5f",
      row: 12,
      col: 3,
    });
  });

  test("the short form, a row id, and junk are null", () => {
    expect(parseScopedCellId("cell.1.2")).toBeNull();
    expect(parseScopedCellId("sheet.row.1")).toBeNull();
    expect(parseScopedCellId("sheet.cell.a.b")).toBeNull();
    expect(parseScopedCellId("")).toBeNull();
  });
});
