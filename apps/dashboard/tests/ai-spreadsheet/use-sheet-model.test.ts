import { describe, expect, test } from "bun:test";
import { normalize } from "@/components/ai-spreadsheet/use-sheet-model";
import { columnTypes } from "@/lib/ai-spreadsheet/cell-format";
import type { ApiRow, SheetPayload } from "@/lib/ai-spreadsheet/types";
import { cellKey } from "@/lib/ai-spreadsheet/types";

const row = (
  index: number,
  entries: ApiRow["columns"] = [
    { id: "col.0", name: "Name", value: "Muhammad" },
    { id: "col.1", name: "Age", value: 26 },
    { id: "col.2", name: "Active", value: true },
  ],
): ApiRow => ({ id: `row.${index}`, index, columns: entries });

const plain = { node: null, prompt: null };

const payload = (overrides: Partial<SheetPayload> = {}): SheetPayload => ({
  spreadsheet: {
    id: "sheet_123",
    name: "Customers",
    totalRows: 5_000_000,
    totalColumns: 3,
  },
  columns: [
    {
      id: "col.0",
      index: 0,
      sortOrder: 0,
      name: "Name",
      type: "string",
      ...plain,
    },
    {
      id: "col.1",
      index: 1,
      sortOrder: 1,
      name: "Age",
      type: "number",
      ...plain,
    },
    {
      id: "col.2",
      index: 2,
      sortOrder: 2,
      name: "Active",
      type: "boolean",
      ...plain,
    },
  ],
  rows: [row(0)],
  pagination: { startRow: 0, limit: 100, hasMore: true, nextCursor: "row.100" },
  ...overrides,
});

describe("normalize", () => {
  test("maps nested entries onto column ids", () => {
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
      payload({
        rows: [
          row(0, [
            { id: "col.1", name: "Age", value: 0 },
            { id: "col.2", name: "Active", value: false },
          ]),
        ],
      }),
    );
    expect(model.cells.get(cellKey(0, "col.2"))).toBe(false);
    expect(model.cells.get(cellKey(0, "col.1"))).toBe(0);
  });

  test("an explicit `value: null` leaves no key at all", () => {
    const model = normalize(
      payload({
        rows: [row(0, [{ id: "col.1", name: "Age", value: null }])],
      }),
    );
    expect(model.cells.has(cellKey(0, "col.1"))).toBe(false);
  });

  test("absent entries leave their cells blank", () => {
    const model = normalize(
      payload({
        rows: [row(0, [{ id: "col.0", name: "Name", value: "Ali" }])],
      }),
    );
    expect(model.cells.get(cellKey(0, "col.0"))).toBe("Ali");
    expect(model.cells.has(cellKey(0, "col.1"))).toBe(false);
    expect(model.cells.has(cellKey(0, "col.2"))).toBe(false);
  });

  test("an entry for an unknown column is stored but never painted", () => {
    const model = normalize(
      payload({
        rows: [
          row(0, [
            { id: "col.0", name: "Name", value: "Ali" },
            { id: "col.9", name: "Ghost", value: "extra" },
          ]),
        ],
      }),
    );
    // Columns drive painting, so the orphan key is harmless.
    expect(model.cells.get(cellKey(0, "col.9"))).toBe("extra");
    expect(model.columns.some((column) => column.id === "col.9")).toBe(false);
  });

  test("`row.index` is the absolute row, not a position in `rows`", () => {
    const model = normalize(
      payload({
        rows: [row(400, [{ id: "col.0", name: "Name", value: "Far" }])],
      }),
    );
    expect(model.cells.get(cellKey(400, "col.0"))).toBe("Far");
    expect(model.rowIds.get(400)).toBe("row.400");
  });

  test("columns are ordered by sortOrder, whatever order they arrive in", () => {
    const model = normalize(
      payload({
        columns: [
          {
            id: "col.2",
            index: 2,
            sortOrder: 2,
            name: "Active",
            type: "boolean",
            ...plain,
          },
          {
            id: "col.0",
            index: 0,
            sortOrder: 0,
            name: "Name",
            type: "string",
            ...plain,
          },
          {
            id: "col.1",
            index: 1,
            sortOrder: 1,
            name: "Age",
            type: "number",
            ...plain,
          },
        ],
      }),
    );
    expect(model.columns.map((column) => column.id)).toEqual([
      "col.0",
      "col.1",
      "col.2",
    ]);
  });

  // A reordered sheet is exactly the case where the two numbers disagree, and
  // `sortOrder` is the one that decides what the user sees.
  test("sortOrder decides the order, not index", () => {
    const model = normalize(
      payload({
        columns: [
          {
            id: "col.0",
            index: 0,
            sortOrder: 2,
            name: "Name",
            type: "string",
            ...plain,
          },
          {
            id: "col.1",
            index: 1,
            sortOrder: 0,
            name: "Age",
            type: "number",
            ...plain,
          },
          {
            id: "col.2",
            index: 2,
            sortOrder: 1,
            name: "Active",
            type: "boolean",
            ...plain,
          },
        ],
      }),
    );
    expect(model.columns.map((column) => column.id)).toEqual([
      "col.1",
      "col.2",
      "col.0",
    ]);
    // Identity is untouched: the ids still mint past the highest index.
    expect(model.nextColumnIndex).toBe(3);
  });

  // The cell keys are column ids, so a reorder moves no value.
  test("a reorder leaves every cell with its own column", () => {
    const model = normalize(
      payload({
        columns: [
          {
            id: "col.0",
            index: 0,
            sortOrder: 2,
            name: "Name",
            type: "string",
            ...plain,
          },
          {
            id: "col.1",
            index: 1,
            sortOrder: 0,
            name: "Age",
            type: "number",
            ...plain,
          },
          {
            id: "col.2",
            index: 2,
            sortOrder: 1,
            name: "Active",
            type: "boolean",
            ...plain,
          },
        ],
      }),
    );
    expect(model.cells.get(cellKey(0, "col.0"))).toBe("Muhammad");
    expect(model.cells.get(cellKey(0, "col.1"))).toBe(26);
  });

  test("maps a column's node and prompt through", () => {
    const model = normalize(
      payload({
        columns: [
          {
            id: "col.0",
            index: 0,
            sortOrder: 0,
            name: "Summary",
            type: "string",
            node: "ai",
            prompt: "Summarise the row",
          },
        ],
      }),
    );
    expect(model.columns[0]?.node).toBe("ai");
    expect(model.columns[0]?.prompt).toBe("Summarise the row");
  });

  test("degrades an unknown node to a plain column", () => {
    const model = normalize(
      payload({
        columns: [
          {
            id: "col.0",
            index: 0,
            sortOrder: 0,
            name: "Name",
            type: "string",
            node: "robot" as never,
            prompt: null,
          },
        ],
      }),
    );
    expect(model.columns[0]?.node).toBeNull();
  });

  // Deleting a column leaves its index as a permanent gap on the backend, so
  // a payload can arrive gapped; the next column must still mint past the max.
  test("a gapped payload renders compactly and appends past the max index", () => {
    const model = normalize(
      payload({
        columns: [
          {
            id: "col.0",
            index: 0,
            sortOrder: 0,
            name: "Name",
            type: "string",
            ...plain,
          },
          // The backend closes the sort-order gap a delete leaves; only the
          // index gap is permanent.
          {
            id: "col.2",
            index: 2,
            sortOrder: 1,
            name: "Active",
            type: "boolean",
            ...plain,
          },
        ],
      }),
    );
    expect(model.columns.map((column) => column.id)).toEqual([
      "col.0",
      "col.2",
    ]);
    expect(model.nextColumnIndex).toBe(3);
  });

  // `formula` is in the API's COLUMN_TYPES_WIRE but not in the column picker:
  // the sheet must still render one the API returns, as plain text.
  test("keeps a formula column rather than degrading it", () => {
    const model = normalize(
      payload({
        columns: [
          {
            id: "col.0",
            index: 0,
            sortOrder: 0,
            name: "Total",
            type: "formula",
            ...plain,
          },
        ],
      }),
    );
    expect(model.columns[0]?.type).toBe("formula");
    expect(columnTypes).not.toContain("formula");
  });
});
