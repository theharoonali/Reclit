import { describe, expect, test } from "bun:test";
import { normalize } from "@/components/ai-spreadsheet/use-sheet-model";
import type { SheetPayload } from "@/lib/ai-spreadsheet/types";
import { cellKey } from "@/lib/ai-spreadsheet/types";

const payload = (overrides: Partial<SheetPayload> = {}): SheetPayload => ({
  spreadsheet: {
    id: "sheet_123",
    name: "Customers",
    totalRows: 5_000_000,
    totalColumns: 3,
  },
  columns: [
    { id: "col.0", index: 0, name: "Name", type: "string" },
    { id: "col.1", index: 1, name: "Age", type: "number" },
    { id: "col.2", index: 2, name: "Active", type: "boolean" },
  ],
  rows: [{ id: "row.0", index: 0, data: ["Muhammad", 26, true] }],
  pagination: { startRow: 0, limit: 100, hasMore: true, nextCursor: "row.100" },
  ...overrides,
});

describe("normalize", () => {
  test("maps `data` positionally onto column ids", () => {
    const model = normalize(payload());
    expect(model.cells.get(cellKey(0, "col.0"))).toBe("Muhammad");
    expect(model.cells.get(cellKey(0, "col.1"))).toBe(26);
    expect(model.cells.get(cellKey(0, "col.2"))).toBe(true);
  });

  test("reads the sheet's own totals", () => {
    const model = normalize(payload());
    expect(model.sheetId).toBe("sheet_123");
    expect(model.sheetName).toBe("Customers");
    expect(model.rowCount).toBe(5_000_000);
  });

  test("`false` survives — it is a value, not a blank", () => {
    const model = normalize(
      payload({ rows: [{ id: "row.0", index: 0, data: ["Ali", 0, false] }] }),
    );
    expect(model.cells.get(cellKey(0, "col.2"))).toBe(false);
    expect(model.cells.get(cellKey(0, "col.1"))).toBe(0);
  });

  test("an explicit null leaves no key at all", () => {
    const model = normalize(
      payload({ rows: [{ id: "row.0", index: 0, data: ["Ali", null, true] }] }),
    );
    expect(model.cells.has(cellKey(0, "col.1"))).toBe(false);
  });

  test("a short `data` array leaves the trailing cells blank", () => {
    const model = normalize(
      payload({ rows: [{ id: "row.0", index: 0, data: ["Ali"] }] }),
    );
    expect(model.cells.get(cellKey(0, "col.0"))).toBe("Ali");
    expect(model.cells.has(cellKey(0, "col.1"))).toBe(false);
    expect(model.cells.has(cellKey(0, "col.2"))).toBe(false);
  });

  test("entries past the last column are ignored, not fatal", () => {
    const model = normalize(
      payload({
        rows: [{ id: "row.0", index: 0, data: ["Ali", 1, true, "extra"] }],
      }),
    );
    expect(model.cells.size).toBe(3);
  });

  test("`row.index` is the absolute row, not a position in `rows`", () => {
    const model = normalize(
      payload({
        rows: [{ id: "row.400", index: 400, data: ["Far", 1, true] }],
      }),
    );
    expect(model.cells.get(cellKey(400, "col.0"))).toBe("Far");
    expect(model.rowIds.get(400)).toBe("row.400");
  });

  test("columns are ordered by index, whatever order they arrive in", () => {
    const model = normalize(
      payload({
        columns: [
          { id: "col.2", index: 2, name: "Active", type: "boolean" },
          { id: "col.0", index: 0, name: "Name", type: "string" },
          { id: "col.1", index: 1, name: "Age", type: "number" },
        ],
      }),
    );
    expect(model.columns.map((column) => column.id)).toEqual([
      "col.0",
      "col.1",
      "col.2",
    ]);
  });

  test("an unknown column type degrades to string", () => {
    const model = normalize(
      payload({
        columns: [{ id: "col.0", index: 0, name: "Name", type: "geography" }],
      }),
    );
    expect(model.columns[0]?.type).toBe("string");
  });
});
