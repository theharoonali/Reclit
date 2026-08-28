import { postFile } from "@/lib/api-fetch";
import type { ColumnType } from "./types";

/**
 * Replaces a spreadsheet's whole grid with the contents of a CSV or XLSX file
 * through `POST /spreadsheets/:id/import`.
 *
 * The response shape is hand-declared, like `UploadedFile` in `upload-file.ts`:
 * the endpoint is REST-only, so there is no `RouterOutputs` entry to alias. The
 * contract lives in the header of
 * `apps/api/src/__tests__/spreadsheet.api.test.ts`.
 */
export type SheetImportResult = {
  id: string;
  name: string;
  /** The sheet's virtual grid height — an import does not change it. */
  totalRows: number;
  totalColumns: number;
  /** Data rows the file held, header excluded. */
  rowCount: number;
  cellCount: number;
  columns: { id: string; index: number; name: string; type: ColumnType }[];
};

export const importSpreadsheet = (sheetId: string, file: File) =>
  postFile<SheetImportResult>(`/spreadsheets/${sheetId}/import`, file);
