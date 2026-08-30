import type {
  CellValue,
  ColumnType,
  JsonObject,
  NodeType,
  SheetFormatters,
  SheetLabels,
} from "./types";

/** Every type the API can return, in its order. Used to recognise, not to offer. */
const ALL_COLUMN_TYPES: ColumnType[] = [
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
];

/**
 * The types a user may pick in the column form. `formula` is deliberately
 * absent: the API can return one and the sheet renders it as text, but there is
 * no editor for it yet, so offering it would create a column nobody can fill.
 */
export const columnTypes: ColumnType[] = ALL_COLUMN_TYPES.filter(
  (type) => type !== "formula",
);

/** The nodes a user may pick in the column form, in the API's order. */
export const nodeTypes: NodeType[] = ["ai", "email"];

/** Unknown server nodes degrade to a plain column rather than throwing. */
export function toNodeType(raw: string | null): NodeType | null {
  return nodeTypes.find((node) => node === raw) ?? null;
}

// Character-for-character the API's rule (`spreadsheet.schema.ts`); the two
// cannot be shared, since `apps/api` exports only `./trpc/routers/_app`.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+$/i;

/** Unknown server types degrade to editable text rather than throwing. */
export function toColumnType(raw: string): ColumnType {
  const match = ALL_COLUMN_TYPES.find((type) => type === raw);
  return match ?? "string";
}

export function isJsonObject(value: CellValue): value is JsonObject {
  return typeof value === "object" && value !== null;
}

export const jsonKeyCount = (value: CellValue) =>
  isJsonObject(value) ? Object.keys(value).length : 0;

/**
 * File and audio cells hold the URL of the thing itself, so both are validated
 * the same way; anything that is not a URL is mistyped.
 */
export function isResourceUrl(value: CellValue): value is string {
  return typeof value === "string" && URL_RE.test(value);
}

/**
 * The name shown on a file or audio capsule: the last path segment,
 * percent-decoded. A URL with no path segment at all falls back to the whole
 * string rather than painting an empty chip.
 */
export function fileLabel(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  const segment = withoutQuery.split("/").filter(Boolean).pop();
  if (!segment || segment.includes(":")) return url;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Built once per locale, not per cell per frame. Dates are rendered in UTC on
 * purpose: the wire format is ISO-8601 with a `Z`, and formatting in the
 * viewer's zone would make the same row read differently in two offices.
 */
export function createFormatters(locale: string): SheetFormatters {
  return {
    number: new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }),
    date: new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  };
}

/**
 * True when the stored value does not match its column's type — the result of
 * typing `abc` into a number column. The value is kept rather than discarded,
 * and painted in the destructive colour so the mismatch is visible.
 */
export function isMistyped(value: CellValue, type: ColumnType): boolean {
  if (value === null) return false;
  switch (type) {
    case "number":
      return typeof value !== "number";
    case "boolean":
      return typeof value !== "boolean";
    case "json":
      return !isJsonObject(value);
    case "file":
    case "audio":
      return !isResourceUrl(value);
    case "date":
      return typeof value !== "string" || !Number.isFinite(Date.parse(value));
    case "email":
      return typeof value !== "string" || !EMAIL_RE.test(value);
    case "url":
      return typeof value !== "string" || !URL_RE.test(value);
    default:
      return false;
  }
}

/**
 * The text painted in a cell. JSON, file, audio and boolean cells draw a
 * capsule instead, so they only ever reach this when the value does not match
 * the column — a mismatch is painted as text in the invalid colour.
 */
export function formatCellText(
  value: CellValue,
  type: ColumnType,
  labels: SheetLabels,
  formatters: SheetFormatters,
): string {
  if (value === null) return "";
  if (type === "json" && isJsonObject(value)) return "";
  if ((type === "file" || type === "audio") && isResourceUrl(value)) return "";
  if (typeof value === "boolean") {
    return value ? labels.boolTrue : labels.boolFalse;
  }
  if (type === "number" && typeof value === "number") {
    return formatters.number.format(value);
  }
  if (type === "date" && typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? formatters.date.format(parsed) : value;
  }
  // An object in a non-JSON column is mistyped; showing its JSON is more use
  // than `[object Object]`.
  if (isJsonObject(value)) return JSON.stringify(value);
  return String(value);
}

/** The text an edit starts from — the raw value, not the display formatting. */
export function editableText(value: CellValue, type: ColumnType): string {
  if (value === null) return "";
  if (type === "json") return "";
  if (isJsonObject(value)) return JSON.stringify(value);
  return String(value);
}

export type ParseResult = { ok: boolean; value: CellValue };

/**
 * Never discards the user's keystrokes: an unparseable entry is stored as the
 * raw string with `ok: false`, and `isMistyped` then paints it as invalid.
 */
export function parseCellInput(text: string, type: ColumnType): ParseResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };

  switch (type) {
    case "number": {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed)
        ? { ok: true, value: parsed }
        : { ok: false, value: text };
    }
    case "boolean": {
      const lower = trimmed.toLowerCase();
      if (["true", "yes", "1"].includes(lower))
        return { ok: true, value: true };
      if (["false", "no", "0"].includes(lower)) {
        return { ok: true, value: false };
      }
      return { ok: false, value: text };
    }
    case "date": {
      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed)
        ? { ok: true, value: new Date(parsed).toISOString() }
        : { ok: false, value: text };
    }
    case "json": {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
          return { ok: true, value: parsed as JsonObject };
        }
      } catch {
        // Falls through to the raw string below.
      }
      return { ok: false, value: text };
    }
    case "email":
      return { ok: EMAIL_RE.test(trimmed), value: trimmed };
    // A file or audio cell is its URL, so it is edited and validated like one.
    case "url":
    case "file":
    case "audio":
      return { ok: URL_RE.test(trimmed), value: trimmed };
    default:
      return { ok: true, value: text };
  }
}
