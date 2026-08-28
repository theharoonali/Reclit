import ExcelJS from "exceljs";
import Papa from "papaparse";
import {
  SpreadsheetImportEmptyError,
  SpreadsheetImportUnreadableError,
} from "./spreadsheet.errors";

// Bytes in, a ragged grid of strings out, header included as row 0. Both
// readers converge on that one shape so `spreadsheet-import.infer.ts` has
// exactly one input to reason about. Pure: no prisma, no NestJS.

export type ImportFormat = "csv" | "xlsx";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * The extension decides, because it is what the user actually chose; browsers
 * are unreliable about the type (they send "application/vnd.ms-excel" for a
 * .csv). The mime type is consulted only for a file with no extension at all,
 * so a `notes.txt` is rejected however it was labelled.
 *
 * `.xls` (legacy BIFF) is deliberately unsupported: exceljs cannot read it.
 */
export function detectFormat(
  filename: string,
  mimeType: string,
): ImportFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.includes(".")) return null;
  if (mimeType === "text/csv") return "csv";
  if (mimeType === XLSX_MIME) return "xlsx";
  return null;
}

export async function readTable(
  bytes: Uint8Array,
  format: ImportFormat,
): Promise<string[][]> {
  return format === "csv" ? readCsv(bytes) : readXlsx(bytes);
}

function readCsv(bytes: Uint8Array): string[][] {
  // Strip the BOM Excel writes when it saves as CSV.
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  // Checked before parsing: Papa reports a blank input as a delimiter-detection
  // failure, which is a confusing way to say "the file is empty".
  if (text.trim() === "") throw new SpreadsheetImportEmptyError();
  const result = Papa.parse<string[]>(text, {
    header: false,
    // Not "greedy": a ",,," line is a real blank row, an empty line is not.
    skipEmptyLines: true,
    // Coercion belongs to the inferred column type, not to the parser.
    dynamicTyping: false,
  });
  // Papa's errors are all warnings for our purposes and none is worth failing
  // on: a single-column file legitimately has no delimiter to detect (Papa
  // reports that and defaults to ","), and ragged rows are normalised by width
  // later. An unusable file is caught by the blank check above, or surfaces as
  // an empty grid in `inferSheet`.
  return result.data.map((row) => row.map((cell) => cell ?? ""));
}

async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(toArrayBuffer(bytes));
  } catch (error) {
    throw new SpreadsheetImportUnreadableError(
      error instanceof Error ? error.message : "not a readable workbook",
    );
  }
  // The first worksheet only. A workbook is a sheet here, not a folder of them.
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SpreadsheetImportEmptyError();

  const width = sheet.columnCount;
  const grid: string[][] = [];
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    const record = sheet.getRow(row);
    grid.push(
      Array.from({ length: width }, (_, column) =>
        cellText(record.getCell(column + 1).value),
      ),
    );
  }
  return grid;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

/**
 * Flattens exceljs's typed cells to the plain text a CSV would have carried, so
 * inference sees one vocabulary. A formula cell contributes its cached result,
 * which is the value a reader of the file would see.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String((value as { text: unknown }).text);
    if ("richText" in value) {
      const parts = (value as { richText: { text: string }[] }).richText;
      return parts.map((part) => part.text).join("");
    }
    if ("result" in value) {
      return cellText((value as { result: unknown }).result);
    }
    return ""; // error cells (#REF!, #N/A) carry nothing usable
  }
  return String(value);
}
