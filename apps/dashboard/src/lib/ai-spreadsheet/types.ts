/**
 * Every type the spreadsheet needs, split into three groups:
 *
 * 1. `Api*` / `SheetPayload` — the wire shape, exactly as the backend sends it.
 * 2. `Sheet*` — the normalised in-memory model the canvas paints from.
 * 3. `Viewport` / `EditorState` / `PanelState` — transient UI state.
 *
 * Nothing here imports React. The painters in this folder are pure functions
 * over these types so they can be reasoned about without a canvas in hand.
 */

import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";

/**
 * The column vocabulary is the API's own — `"string"`, not `"text"` — so there
 * is no mapping layer between wire and model. It must stay in lockstep with
 * `COLUMN_TYPES_WIRE` in the API's `spreadsheet.schema.ts`: a type the API can
 * return but this union does not name is a column the sheet cannot render.
 *
 * `email` and `url` are stored as strings and differ only in how they are
 * painted and validated. `formula` is returned by the API but not offered in
 * the column picker — see `columnTypes` in `cell-format.ts`.
 */
export type ColumnType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "formula"
  | "audio"
  | "file"
  | "email"
  | "url";

export type JsonObject = Record<string, unknown>;

export type CellValue = string | number | boolean | JsonObject | null;

/* ------------------------------------------------------------------ wire */

/**
 * The wire shapes are the contract's own — type-only aliases of what
 * `spreadsheet.rows` returns, so the sheet cannot drift from the backend
 * (docs/rules/COMMON.md: never re-declare a shape the API describes). A row is
 * nested: one `{ id, name, value }` entry per stored cell, ordered by column
 * index; blank cells are absent entries. `row.index` is the absolute row
 * number in the sheet, not a position in `rows`.
 */
export type SheetPayload = RouterOutputs["spreadsheet"]["rows"];
export type ApiColumn = SheetPayload["columns"][number];
export type ApiRow = SheetPayload["rows"][number];
export type SheetPagination = SheetPayload["pagination"];

/* ----------------------------------------------------------------- model */

export type SheetColumn = { id: string; name: string; type: ColumnType };

/**
 * Cells are sparse. A 5,000,000-row array is not allocatable and pagination
 * means the loaded rows are an arbitrary subset anyway, so absence is the
 * normal case: a missing key is a blank, editable cell.
 *
 * Keys are `${rowIndex}:${columnId}` — column *id*, so inserting or reordering
 * a column later does not shift every value by one.
 */
export type SheetModel = {
  sheetId: string;
  sheetName: string;
  /** `spreadsheet.totalRows`. The sheet scrolls past this into blank rows. */
  rowCount: number;
  columns: SheetColumn[];
  cells: Map<string, CellValue>;
  /** Wire row ids by index; write-back addresses cells by (rowIndex, columnIndex). */
  rowIds: Map<number, string>;
  nextColumnIndex: number;
};

export const cellKey = (row: number, columnId: string) => `${row}:${columnId}`;

/* -------------------------------------------------------------------- ui */

export type CellAddress = { row: number; col: number };

export type SheetHit =
  | { kind: "cell"; row: number; col: number }
  | { kind: "gutter"; row: number }
  | { kind: "header"; col: number }
  | { kind: "plus" }
  | { kind: "empty" };

export type Viewport = {
  /** CSS pixels of the body canvas. */
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  /** `rowCount` plus the blank tail — the current scrollable row extent. */
  rowExtent: number;
  columnCount: number;
};

export type EditorState = {
  active: CellAddress | null;
  mode: "idle" | "editing";
  /** The text being typed. Mirrors the hidden textarea's value. */
  buffer: string;
  caret: number;
  selection: [number, number];
  /** Horizontal scroll *within* the cell, so a long value keeps the caret. */
  innerScrollX: number;
  caretVisible: boolean;
};

export type PanelState =
  | { kind: "closed" }
  /** No `columnId` means "add a new column". */
  | { kind: "column"; columnId?: string }
  | { kind: "json"; row: number; columnId: string }
  | { kind: "date"; row: number; columnId: string }
  | { kind: "audio"; row: number; columnId: string }
  | { kind: "file"; row: number; columnId: string };

/* -------------------------------------------------------- paint contract */

/** Canvas cannot use Tailwind classes, so every colour is resolved up front. */
export type SheetPalette = {
  background: string;
  header: string;
  headerText: string;
  gutter: string;
  gridline: string;
  text: string;
  mutedText: string;
  accent: string;
  accentForeground: string;
  ring: string;
  link: string;
  invalid: string;
  /** The boolean capsule's border and dot. */
  boolTrue: string;
  boolFalse: string;
};

/** Canvas text is user-facing copy, so it comes from next-intl like the rest. */
export type SheetLabels = {
  boolTrue: string;
  boolFalse: string;
  jsonCapsule: (count: number) => string;
  jsonEmpty: string;
  typeNames: Record<ColumnType, string>;
};

/** Canvas fonts are resolved from the element's computed style, once. */
export type SheetFonts = {
  cell: string;
  header: string;
  type: string;
  gutter: string;
};

/** Built once per locale — not `toLocaleString()` per cell per frame. */
export type SheetFormatters = {
  number: Intl.NumberFormat;
  date: Intl.DateTimeFormat;
};
