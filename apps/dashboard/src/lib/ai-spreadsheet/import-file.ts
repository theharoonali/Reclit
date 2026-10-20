import { postFile } from "@/lib/api-fetch";
import type { CellValue, ColumnType } from "./types";

// The two import endpoints. Their response shapes are hand-declared, like
// `UploadedFile` in `upload-file.ts`: the endpoints are REST-only, so there is
// no `RouterOutputs` entry to alias. The contract lives in the header of
// `apps/api/src/__tests__/spreadsheet.api.test.ts`.

/** What `POST /spreadsheets/:id/import` returns after merging a file in. */
export type SheetImportResult = {
  id: string;
  name: string;
  /** The sheet's virtual grid height — an import does not change it. */
  totalRows: number;
  totalColumns: number;
  /** Data rows the file held, header excluded — all appended. */
  rowCount: number;
  cellCount: number;
  columnsMatched: number;
  columnsCreated: number;
  columns: { id: string; index: number; name: string; type: ColumnType }[];
};

/** Where one file column lands: an existing column, or a new one. */
export type ImportTarget =
  | { kind: "existing"; id: string; name: string; type: ColumnType }
  | { kind: "new"; name: string; type: ColumnType };

/** What `POST /spreadsheets/:id/import/preview` returns. Nothing is written. */
export type SheetImportPreview = {
  format: "csv" | "xlsx" | "docx";
  /** Tables read from the file; more than one only for a Word document. */
  tableCount: number;
  rowCount: number;
  columns: { source: string; target: ImportTarget; skippedValues: number }[];
  /** The first rows to be appended, one value per entry of `columns`. */
  sampleRows: CellValue[][];
};

/** The file-picker filter for every sheet upload (import, onboarding). */
export const SHEET_FILE_ACCEPT = [
  ".csv",
  ".xlsx",
  ".docx",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

export const previewImport = (sheetId: string, file: File) =>
  postFile<SheetImportPreview>(`/spreadsheets/${sheetId}/import/preview`, file);

export const importSpreadsheet = (sheetId: string, file: File) =>
  postFile<SheetImportResult>(`/spreadsheets/${sheetId}/import`, file);
