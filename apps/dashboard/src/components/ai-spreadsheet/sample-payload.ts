import type { SheetPayload } from "@/lib/ai-spreadsheet/types";

/**
 * Stand-in for the response the sheet endpoint will return. It is data, not
 * copy — like `WORKSPACE` in `config/nav.ts` — so these literals stay out of
 * `messages/en.json`.
 *
 * Two rows here are load-bearing for testing rather than decoration:
 * `row_0` has no `Metadata` cell at all (a missing cell is `null`, not an
 * error), and `row_2` sends an explicit `null`. Both must render blank.
 */
export const SAMPLE_PAYLOAD: SheetPayload = {
  sheet: {
    id: "sheet_123",
    name: "Customers",
    rowCount: 5_000_000,
    columnCount: 5,
  },

  columns: [
    { id: "col_0", index: 0, name: "Name", type: "string" },
    { id: "col_1", index: 1, name: "Email", type: "string" },
    { id: "col_2", index: 2, name: "Age", type: "number" },
    { id: "col_3", index: 3, name: "Joined", type: "date" },
    { id: "col_4", index: 4, name: "Metadata", type: "json" },
  ],

  rows: [
    {
      id: "row_0",
      index: 0,
      cells: [
        { id: "cell_0_0", column: 0, value: "Muhammad" },
        { id: "cell_0_1", column: 1, value: "muhammad@gmail.com" },
        { id: "cell_0_2", column: 2, value: 26 },
        { id: "cell_0_3", column: 3, value: "2026-08-27T10:00:00Z" },
      ],
    },
    {
      id: "row_1",
      index: 1,
      cells: [
        { id: "cell_1_0", column: 0, value: "Ali" },
        { id: "cell_1_1", column: 1, value: "ali@example.com" },
        { id: "cell_1_2", column: 2, value: 29 },
        { id: "cell_1_3", column: 3, value: "2025-01-14T08:30:00Z" },
        {
          id: "cell_1_4",
          column: 4,
          value: { country: "Pakistan", plan: "pro", seats: 12 },
        },
      ],
    },
    {
      id: "row_2",
      index: 2,
      cells: [
        { id: "cell_2_0", column: 0, value: "John" },
        { id: "cell_2_1", column: 1, value: null },
        { id: "cell_2_2", column: 2, value: 31 },
        { id: "cell_2_3", column: 3, value: "2024-11-02T16:45:00Z" },
        { id: "cell_2_4", column: 4, value: { country: "Germany" } },
      ],
    },
    {
      id: "row_3",
      index: 3,
      cells: [
        { id: "cell_3_0", column: 0, value: "Priya" },
        { id: "cell_3_1", column: 1, value: "priya@example.com" },
        { id: "cell_3_2", column: 2, value: 34 },
        { id: "cell_3_3", column: 3, value: "2023-06-21T09:15:00Z" },
        {
          id: "cell_3_4",
          column: 4,
          value: { country: "India", plan: "free" },
        },
      ],
    },
    {
      id: "row_4",
      index: 4,
      cells: [
        { id: "cell_4_0", column: 0, value: "Sofia" },
        { id: "cell_4_1", column: 1, value: "sofia@example.com" },
        { id: "cell_4_2", column: 2, value: 27 },
        { id: "cell_4_3", column: 3, value: "2026-02-09T12:00:00Z" },
      ],
    },
  ],

  pagination: {
    startRow: 0,
    limit: 100,
    hasMore: true,
    nextCursor: "abc123",
  },
};
