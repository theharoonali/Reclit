import type { SheetPayload } from "@/lib/ai-spreadsheet/types";

/**
 * Stand-in for the response the sheet endpoint will return. It is data, not
 * copy — like `WORKSPACE` in `config/nav.ts` — so these literals stay out of
 * `messages/en.json`.
 *
 * `data` is positional by column index. Several holes here are load-bearing
 * for testing rather than decoration: `row.1` sends explicit `null`s, `row.4`
 * stops short of the last columns entirely, and both must render blank.
 */
export const SAMPLE_PAYLOAD: SheetPayload = {
  spreadsheet: {
    id: "sheet_123",
    name: "Customers",
    totalRows: 5_000_000,
    totalColumns: 8,
  },

  columns: [
    { id: "col.0", index: 0, name: "Name", type: "string" },
    { id: "col.1", index: 1, name: "Email", type: "string" },
    { id: "col.2", index: 2, name: "Age", type: "number" },
    { id: "col.3", index: 3, name: "Joined", type: "date" },
    { id: "col.4", index: 4, name: "Metadata", type: "json" },
    { id: "col.5", index: 5, name: "Active", type: "boolean" },
    { id: "col.6", index: 6, name: "Resume", type: "file" },
    { id: "col.7", index: 7, name: "Intro", type: "voice" },
  ],

  rows: [
    {
      id: "row.0",
      index: 0,
      data: [
        "Muhammad",
        "muhammad@example.com",
        26,
        "2026-08-27T10:00:00.000Z",
        { country: "Germany", skills: ["React", "Node.js"] },
        true,
        "https://example.com/files/muhammad-resume.pdf",
        "https://example.com/voice/muhammad-intro.mp3",
      ],
    },
    {
      id: "row.1",
      index: 1,
      data: [
        "Ali",
        null,
        29,
        null,
        { country: "Pakistan" },
        false,
        "https://example.com/files/ali-cv.pdf",
        "https://example.com/voice/ali-intro.mp3",
      ],
    },
    {
      id: "row.2",
      index: 2,
      data: [
        "John",
        "john@example.com",
        31,
        "2026-08-20T12:00:00.000Z",
        null,
        true,
        null,
        "https://example.com/voice/john-intro.mp3",
      ],
    },
    {
      id: "row.3",
      index: 3,
      data: [
        "Priya",
        "priya@example.com",
        34,
        "2023-06-21T09:15:00.000Z",
        { country: "India", plan: "free" },
        null,
        "https://example.com/files/priya-portfolio.pdf",
        null,
      ],
    },
    {
      id: "row.4",
      index: 4,
      data: ["Sofia", "sofia@example.com", 27, "2026-02-09T12:00:00.000Z"],
    },
  ],

  pagination: {
    startRow: 0,
    limit: 100,
    hasMore: true,
    nextCursor: "row.100",
  },
};
