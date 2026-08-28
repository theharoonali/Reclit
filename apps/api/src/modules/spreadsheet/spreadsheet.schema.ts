import { z } from "zod";
import { idInput, paginationInput } from "../../common/schema";

// Single source of truth for the spreadsheet shapes. The wire vocabulary is
// lowercase ("string", "audio", ...); the database enum is its uppercase
// mirror. The 1:1 case mapping lives here and nowhere else.

export const COLUMN_TYPES_WIRE = [
  "string",
  "number",
  "boolean",
  "date",
  "json",
  "formula",
  "audio",
  "file",
  "email",
  "url",
] as const;

export const columnTypeWire = z.enum(COLUMN_TYPES_WIRE);
export type ColumnTypeWire = z.infer<typeof columnTypeWire>;
export type ColumnTypeDb = Uppercase<ColumnTypeWire>;

export const toDbColumnType = (type: ColumnTypeWire): ColumnTypeDb =>
  type.toUpperCase() as ColumnTypeDb;
export const toWireColumnType = (type: string): ColumnTypeWire =>
  type.toLowerCase() as ColumnTypeWire;

/** What a cell may hold on the wire. `null` clears the cell. */
export const cellValueSchema = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
  z.record(z.string(), z.unknown()),
  z.null(),
]);
export type CellValue = z.infer<typeof cellValueSchema>;

const URL_RE = /^https?:\/\/\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared with the import inference, which must accept exactly what this does. */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a wire value fits a column's declared type. Pure — the *check* is a
 * business rule in the service (it needs the column row, which only the
 * service may read), but the predicate lives with the shapes.
 */
export function cellValueMatchesType(
  value: CellValue,
  type: ColumnTypeWire,
): boolean {
  if (value === null) return true;
  switch (type) {
    case "string":
    case "formula":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && Number.isFinite(Date.parse(value));
    case "json":
      return isPlainObject(value);
    case "audio":
    case "file":
    case "url":
      return typeof value === "string" && URL_RE.test(value);
    case "email":
      return typeof value === "string" && EMAIL_RE.test(value);
  }
}

/* ---------------------------------------------------------------- outputs */

export const spreadsheetMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  totalRows: z.number().int(),
  totalColumns: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const sheetColumnSchema = z.object({
  id: z.string(), // "col.<index>"
  index: z.number().int(),
  name: z.string(),
  type: columnTypeWire,
});

/** One stored cell inside a nested row: column id + name + value. */
export const sheetRowEntrySchema = z.object({
  id: z.string(), // "col.<index>"
  name: z.string(),
  value: cellValueSchema,
});

export const sheetRowSchema = z.object({
  id: z.string(), // "row.<index>"
  index: z.number().int(),
  columns: z.array(sheetRowEntrySchema),
});

export const sheetCellSchema = z.object({
  id: z.string(), // "cell.<rowIndex>.<columnIndex>"
  rowIndex: z.number().int(),
  columnIndex: z.number().int(),
  value: cellValueSchema,
});

export const sheetPaginationSchema = z.object({
  startRow: z.number().int(),
  limit: z.number().int(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

export const sheetPayloadSchema = z.object({
  spreadsheet: z.object({
    id: z.string(),
    name: z.string(),
    totalRows: z.number().int(),
    totalColumns: z.number().int(),
  }),
  columns: z.array(sheetColumnSchema),
  rows: z.array(sheetRowSchema),
  pagination: sheetPaginationSchema,
});

export type SpreadsheetMeta = z.infer<typeof spreadsheetMetaSchema>;
export type SheetColumn = z.infer<typeof sheetColumnSchema>;
export type SheetRowEntry = z.infer<typeof sheetRowEntrySchema>;
export type SheetRow = z.infer<typeof sheetRowSchema>;
export type SheetCell = z.infer<typeof sheetCellSchema>;
export type SheetPayload = z.infer<typeof sheetPayloadSchema>;

/* ----------------------------------------------------------------- inputs */

const name = z.string().trim().min(1, "Name is required").max(200);
// Coerced so REST path params ("0") parse through the same schemas as tRPC
// numbers.
const gridIndex = z.coerce.number().int().min(0);

export const createSpreadsheetInput = z.object({
  name,
  totalRows: z.coerce.number().int().min(1).max(10_000_000).default(5_000_000),
});

export const sheetRowsInput = idInput.extend(paginationInput.shape);
export const rowRefInput = idInput.extend({ rowIndex: gridIndex });
export const columnRefInput = idInput.extend({ columnIndex: gridIndex });
export const cellRefInput = rowRefInput.extend({ columnIndex: gridIndex });

export const setCellInput = cellRefInput.extend({ value: cellValueSchema });

export const updateRowInput = rowRefInput.extend({
  cells: z
    .array(z.object({ columnIndex: gridIndex, value: cellValueSchema }))
    .min(1),
});

/**
 * Built from undefaulted fields on purpose: `createColumnInput.partial()` would
 * keep `type`'s `.default("string")` and silently retype the column on a
 * name-only update.
 */
export const updateColumnInput = z
  .object({ name, type: columnTypeWire })
  .partial()
  .extend(columnRefInput.shape);

export const createRowInput = idInput.extend({
  index: gridIndex.optional(),
});

export const createColumnInput = idInput.extend({
  name,
  type: columnTypeWire.default("string"),
});

export type CreateSpreadsheetInput = z.infer<typeof createSpreadsheetInput>;
export type SheetRowsInput = z.infer<typeof sheetRowsInput>;
export type RowRefInput = z.infer<typeof rowRefInput>;
export type ColumnRefInput = z.infer<typeof columnRefInput>;
export type CellRefInput = z.infer<typeof cellRefInput>;
export type SetCellInput = z.infer<typeof setCellInput>;
export type UpdateRowInput = z.infer<typeof updateRowInput>;
export type UpdateColumnInput = z.infer<typeof updateColumnInput>;
export type CreateRowInput = z.infer<typeof createRowInput>;
export type CreateColumnInput = z.infer<typeof createColumnInput>;

/* ----------------------------------------------------------------- import */

export const MAX_IMPORT_COLUMNS = 256;
export const MAX_IMPORT_ROWS = 20_000;

/**
 * What POST /spreadsheets/:id/import returns.
 *
 * `totalRows` is the sheet's virtual grid height and is NOT changed by an
 * import; `rowCount` is how many data rows the file held (header excluded).
 */
export const sheetImportResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  totalRows: z.number().int(),
  totalColumns: z.number().int(),
  rowCount: z.number().int(),
  cellCount: z.number().int(),
  columns: z.array(sheetColumnSchema),
});

export type SheetImportResult = z.infer<typeof sheetImportResultSchema>;
