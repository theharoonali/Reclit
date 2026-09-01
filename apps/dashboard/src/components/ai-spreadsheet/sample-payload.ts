import type { SheetPayload } from "@/lib/ai-spreadsheet/types";

/**
 * Stand-in for the response `spreadsheet.rows` returns — the dashboard tests
 * normalise it, and it documents the nested wire shape. It is data, not copy —
 * like `WORKSPACE` in `config/nav.ts` — so these literals stay out of
 * `messages/en.json`.
 *
 * A row carries one `{ id, name, value }` entry per stored cell; blank cells
 * are absent entries. The holes here are load-bearing for testing rather than
 * decoration: `row.1` and `row.4` skip most columns and must render blank, and
 * `row.2` carries one explicit `value: null` to cover the normaliser's
 * defensive skip (the real API never sends one).
 */
/** No sample column carries a node; node cases live in the tests. */
const plain = { node: null, prompt: null };

export const SAMPLE_PAYLOAD: SheetPayload = {
  spreadsheet: {
    id: "sheet_123",
    name: "Customers",
    totalRows: 5_000_000,
    totalColumns: 8,
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
      name: "Email",
      type: "email",
      ...plain,
    },
    {
      id: "col.2",
      index: 2,
      sortOrder: 2,
      name: "Age",
      type: "number",
      ...plain,
    },
    {
      id: "col.3",
      index: 3,
      sortOrder: 3,
      name: "Joined",
      type: "date",
      ...plain,
    },
    {
      id: "col.4",
      index: 4,
      sortOrder: 4,
      name: "Metadata",
      type: "json",
      ...plain,
    },
    {
      id: "col.5",
      index: 5,
      sortOrder: 5,
      name: "Active",
      type: "boolean",
      ...plain,
    },
    {
      id: "col.6",
      index: 6,
      sortOrder: 6,
      name: "Resume",
      type: "file",
      ...plain,
    },
    {
      id: "col.7",
      index: 7,
      sortOrder: 7,
      name: "Intro",
      type: "audio",
      ...plain,
    },
  ],

  rows: [
    {
      id: "row.0",
      index: 0,
      columns: [
        { id: "col.0", name: "Name", value: "Muhammad" },
        { id: "col.1", name: "Email", value: "muhammad@example.com" },
        { id: "col.2", name: "Age", value: 26 },
        { id: "col.3", name: "Joined", value: "2026-08-27T10:00:00.000Z" },
        {
          id: "col.4",
          name: "Metadata",
          value: { country: "Germany", skills: ["React", "Node.js"] },
        },
        { id: "col.5", name: "Active", value: true },
        {
          id: "col.6",
          name: "Resume",
          value: "https://example.com/files/muhammad-resume.pdf",
        },
        {
          id: "col.7",
          name: "Intro",
          value: "https://example.com/audio/muhammad-intro.mp3",
        },
      ],
    },
    {
      id: "row.1",
      index: 1,
      columns: [
        { id: "col.0", name: "Name", value: "Ali" },
        { id: "col.2", name: "Age", value: 29 },
        { id: "col.4", name: "Metadata", value: { country: "Pakistan" } },
        { id: "col.5", name: "Active", value: false },
        {
          id: "col.6",
          name: "Resume",
          value: "https://example.com/files/ali-cv.pdf",
        },
        {
          id: "col.7",
          name: "Intro",
          value: "https://example.com/audio/ali-intro.mp3",
        },
      ],
    },
    {
      id: "row.2",
      index: 2,
      columns: [
        { id: "col.0", name: "Name", value: "John" },
        { id: "col.1", name: "Email", value: "john@example.com" },
        { id: "col.2", name: "Age", value: 31 },
        { id: "col.3", name: "Joined", value: "2026-08-20T12:00:00.000Z" },
        // The API never sends null values; this one covers the normaliser's
        // defensive skip.
        { id: "col.4", name: "Metadata", value: null },
        { id: "col.5", name: "Active", value: true },
        {
          id: "col.7",
          name: "Intro",
          value: "https://example.com/audio/john-intro.mp3",
        },
      ],
    },
    {
      id: "row.3",
      index: 3,
      columns: [
        { id: "col.0", name: "Name", value: "Priya" },
        { id: "col.1", name: "Email", value: "priya@example.com" },
        { id: "col.2", name: "Age", value: 34 },
        { id: "col.3", name: "Joined", value: "2023-06-21T09:15:00.000Z" },
        {
          id: "col.4",
          name: "Metadata",
          value: { country: "India", plan: "free" },
        },
        {
          id: "col.6",
          name: "Resume",
          value: "https://example.com/files/priya-portfolio.pdf",
        },
      ],
    },
    {
      id: "row.4",
      index: 4,
      columns: [
        { id: "col.0", name: "Name", value: "Sofia" },
        { id: "col.1", name: "Email", value: "sofia@example.com" },
        { id: "col.2", name: "Age", value: 27 },
        { id: "col.3", name: "Joined", value: "2026-02-09T12:00:00.000Z" },
      ],
    },
  ],

  pagination: {
    startRow: 0,
    limit: 100,
    hasMore: false,
    nextCursor: null,
  },
};
