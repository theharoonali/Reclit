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

/**
 * The column vocabulary is the API's own — `"string"`, not `"text"` — so there
 * is no mapping layer between wire and model. `email` and `url` are stored as
 * strings and differ only in how they are painted and validated.
 */
export type ColumnType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "email"
  | "url";

export type JsonObject = Record<string, unknown>;

export type CellValue = string | number | boolean | JsonObject | null;

/* ------------------------------------------------------------------ wire */

export type ApiColumn = {
  id: string;
  index: number;
  name: string;
  /** Free-form on purpose: unknown types degrade to `string`. */
  type: string;
};

/** `column` is the column's *index*, not its id. */
export type ApiCell = { id: string; column: number; value: unknown };

/** `index` is the absolute row number in the sheet, not a position in `rows`. */
export type ApiRow = { id: string; index: number; cells: ApiCell[] };

export type SheetPagination = {
  startRow: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type SheetPayload = {
  sheet: { id: string; name: string; rowCount: number; columnCount: number };
  columns: ApiColumn[];
  rows: ApiRow[];
  pagination: SheetPagination;
};

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
  /** `sheet.rowCount`. The sheet scrolls past this into blank rows. */
  rowCount: number;
  columns: SheetColumn[];
  cells: Map<string, CellValue>;
  /** Same key as `cells` → the server's cell id, kept for write-back later. */
  cellIds: Map<string, string>;
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
  | { kind: "json"; row: number; columnId: string };

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
