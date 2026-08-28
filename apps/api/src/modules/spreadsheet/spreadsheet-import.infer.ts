import {
  SpreadsheetImportEmptyError,
  SpreadsheetImportNoHeaderError,
} from "./spreadsheet.errors";
import type { CellValue, ColumnTypeWire } from "./spreadsheet.schema";
import { cellValueMatchesType, isPlainObject } from "./spreadsheet.schema";

// A raw grid of strings in, columns with inferred types and coerced values out.
// Pure: no prisma, no NestJS, no I/O.
//
// The type rules are NOT re-implemented here. Each candidate type gets a
// coercer, and the type is accepted only when `cellValueMatchesType` — the same
// predicate the cells service applies on every write — also passes on the
// coerced value. So `URL_RE` and `EMAIL_RE` stay private to the schema, and an
// imported value can never be one the API would later reject.

export type InferredColumn = { name: string; type: ColumnTypeWire };

export type InferredSheet = {
  columns: InferredColumn[];
  /** Row-major, `[rowIndex][columnIndex]`. `undefined` writes no cell record. */
  cells: (CellValue | undefined)[][];
};

// Words only, deliberately not "1"/"0". Boolean is tried before number, so
// accepting digits would turn every column of counts, flags or ids that happens
// to hold only 0s and 1s into booleans — and `updateColumn` does not convert
// stored cells, so that would not be recoverable by retyping the column.
const TRUE_WORDS = new Set(["true", "yes"]);
const FALSE_WORDS = new Set(["false", "no"]);

/**
 * `Date.parse` is far too permissive to use on its own — it reads "007" as the
 * year 7, which would turn a column of ZIP codes into dates. A value must look
 * like a date before it is parsed as one: digit groups split by `-` or `/`, or
 * a written month name. `Date.parse` still has the final say on validity.
 */
const DATE_LIKE_RE =
  /^\d{4}-\d{1,2}-\d{1,2}([T ].*)?$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{4}\/\d{1,2}\/\d{1,2}$|[a-z]{3}/i;

const AUDIO_EXT = new Set([
  "mp3",
  "wav",
  "m4a",
  "ogg",
  "oga",
  "flac",
  "aac",
  "weba",
  "opus",
]);
const FILE_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "zip",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
]);

/** Order matters: `number` before `date` keeps "26" a number, not a year. */
const CANDIDATES: ColumnTypeWire[] = [
  "boolean",
  "number",
  "date",
  "json",
  "email",
  "url",
];

/**
 * Text to a candidate value, or `undefined` when it does not fit. `email`,
 * `url`, `audio` and `file` pass the text straight through — their real rule is
 * the regex inside `cellValueMatchesType`, which runs next.
 */
function coerce(raw: string, type: ColumnTypeWire): CellValue | undefined {
  switch (type) {
    case "boolean": {
      const word = raw.toLowerCase();
      if (TRUE_WORDS.has(word)) return true;
      if (FALSE_WORDS.has(word)) return false;
      return undefined;
    }
    case "number": {
      // "007" is an identifier — a ZIP code, an order number — not seven. A
      // wrong guess here is unrecoverable: `updateColumn` does not convert
      // stored cells, so retyping the column later would not bring the zeros
      // back.
      if (/^0\d/.test(raw)) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case "date": {
      if (!DATE_LIKE_RE.test(raw)) return undefined;
      const ms = Date.parse(raw);
      return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
    }
    case "json": {
      try {
        const parsed: unknown = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    // `formula` is storage-only — nothing in a file identifies one.
    case "formula":
      return undefined;
    default:
      return raw;
  }
}

/** The extension of a URL's last path segment, without query or fragment. */
function urlKind(url: string): "audio" | "file" | "url" {
  const path = url.split(/[?#]/)[0] ?? "";
  const segment = path.slice(path.lastIndexOf("/") + 1);
  const dot = segment.lastIndexOf(".");
  if (dot < 0) return "url";
  const ext = segment.slice(dot + 1).toLowerCase();
  if (AUDIO_EXT.has(ext)) return "audio";
  if (FILE_EXT.has(ext)) return "file";
  return "url";
}

/** Values are already known-good http(s) URLs; split them by extension. */
function refineUrl(values: string[]): ColumnTypeWire {
  const kinds = values.map(urlKind);
  if (kinds.every((kind) => kind === "audio")) return "audio";
  if (kinds.every((kind) => kind !== "url") && kinds.includes("file")) {
    return "file";
  }
  return "url";
}

/**
 * A type is chosen only when EVERY non-empty value in the column fits it, so
 * one stray value demotes the whole column to `string` rather than dropping it.
 */
function inferColumn(values: string[]): ColumnTypeWire {
  if (values.length === 0) return "string";
  for (const type of CANDIDATES) {
    const fits = values.every((raw) => {
      const value = coerce(raw, type);
      return value !== undefined && cellValueMatchesType(value, type);
    });
    if (fits) return type === "url" ? refineUrl(values) : type;
  }
  return "string";
}

export function inferSheet(grid: string[][]): InferredSheet {
  const header = grid[0];
  if (!header) throw new SpreadsheetImportEmptyError();

  // The width is the header's, up to its last named column: Excel pads rows
  // with empty cells and there is no column without a name.
  let width = 0;
  for (const [index, cell] of header.entries()) {
    if (cell.trim() !== "") width = index + 1;
  }
  if (width === 0) throw new SpreadsheetImportNoHeaderError();

  const rows = trimTrailingBlank(
    grid
      .slice(1)
      .map((row) =>
        Array.from({ length: width }, (_, index) => (row[index] ?? "").trim()),
      ),
  );

  const columns: InferredColumn[] = [];
  const cells: (CellValue | undefined)[][] = rows.map(
    () => new Array<CellValue | undefined>(width),
  );

  for (let column = 0; column < width; column += 1) {
    const raw = rows.map((row) => row[column] ?? "");
    const type = inferColumn(raw.filter((value) => value !== ""));
    columns.push({
      name: (header[column] ?? "").trim() || `Column ${column + 1}`,
      type,
    });
    for (const [index, value] of raw.entries()) {
      const target = cells[index];
      if (!target) continue;
      // `coerce` is non-undefined by construction here: the type was accepted
      // only because every non-empty value in this column coerces to it.
      target[column] = value === "" ? undefined : coerce(value, type);
    }
  }

  return { columns, cells };
}

/**
 * Excel routinely reports a `rowCount` inflated by formatting, so trailing
 * blank rows are dropped. Interior blank rows are kept — a blank row in the
 * file is a blank row in the sheet.
 */
function trimTrailingBlank(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && (rows[end - 1] ?? []).every((cell) => cell === "")) {
    end -= 1;
  }
  return rows.slice(0, end);
}
