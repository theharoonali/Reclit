import type { Value } from "./formula/values";
import { bindSheet, type ColumnMeta, type SheetPayloadLike } from "./sheet";

/**
 * What a sheet's columns hold, column by column: fill, cardinality, ranges,
 * the most common values, and a heuristic `role` — the difference between a
 * quantity (`measure`) and a label that happens to be numeric (`year`,
 * `identifier`). The API hands this to the model so it never proposes
 * `SUM({Year})`; the same pass backs the assistant's column summary tool.
 * Pure and UTC only, like the rest of the engine.
 */

export const COLUMN_ROLES = [
  "identifier",
  "year",
  "time",
  "flag",
  "category",
  "measure",
  "text",
  "other",
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

export type ColumnProfile = {
  name: string;
  type: string;
  role: ColumnRole;
  /** The rows profiled. */
  rows: number;
  filled: number;
  blank: number;
  distinct: number;
  /** The most common values, most frequent first. */
  topValues: { value: string; count: number }[];
  numbers?: {
    min: number;
    max: number;
    sum: number;
    average: number;
    /** Every number is a whole number. */
    integers: boolean;
  };
  /** ISO timestamps. */
  dates?: { min: string; max: string };
};

export const DEFAULT_TOP_VALUES = 5;
/** A value's text in `topValues`, cut to this many characters. */
export const MAX_PROFILE_VALUE_CHARS = 60;

/** A column named like a key: "ID", "Order no", "SKU", "Ref #". */
const IDENTIFIER_NAME_RE = /\b(id|uuid|guid|key|code|sku|ref|no|number)\b|#/i;
const YEAR_NAME_RE = /\byear\b/i;
/** A uuid or hex-ish token, the shape of a generated id. */
const TOKEN_RE = /^[0-9a-f]{8,}(-[0-9a-f]{4,}){0,4}$/i;
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;
/** Below this many filled values an all-distinct column proves nothing. */
const MIN_IDENTIFIER_ROWS = 20;
/** A category has at most this many distinct values … */
const MAX_CATEGORY_VALUES = 25;
/** … and each one repeats: distinct ≤ filled × this. */
const MAX_CATEGORY_RATIO = 0.5;
/** Distinct integers span at most this × their count to read as a sequence. */
const MAX_SEQUENCE_SPREAD = 1.5;

/** One line of text for a value, whitespace collapsed and cut. */
function label(value: Exclude<Value, null>): string {
  const text =
    value instanceof Date
      ? value.toISOString()
      : String(value).replace(/\s+/g, " ").trim();
  return text.length > MAX_PROFILE_VALUE_CHARS
    ? `${text.slice(0, MAX_PROFILE_VALUE_CHARS - 1)}…`
    : text;
}

type Stats = Omit<ColumnProfile, "role" | "name" | "type"> & {
  tokens: boolean;
};

function collect(
  rows: readonly { scope: { get(key: string): Value } }[],
  key: string,
  topValues: number,
): Stats {
  const counts = new Map<string, number>();
  const numbers: number[] = [];
  const dates: number[] = [];
  let filled = 0;
  let tokens = true;
  for (const row of rows) {
    const value = row.scope.get(key);
    if (value === null || value === "") continue;
    filled += 1;
    const text = label(value);
    counts.set(text, (counts.get(text) ?? 0) + 1);
    if (typeof value === "number") numbers.push(value);
    else if (value instanceof Date) dates.push(value.getTime());
    if (typeof value !== "string" || !TOKEN_RE.test(value)) tokens = false;
  }
  const stats: Stats = {
    rows: rows.length,
    filled,
    blank: rows.length - filled,
    distinct: counts.size,
    topValues: [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, topValues)
      .map(([value, count]) => ({ value, count })),
    tokens: filled > 0 && tokens,
  };
  if (numbers.length > 0) {
    const sum = numbers.reduce((total, value) => total + value, 0);
    stats.numbers = {
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      sum,
      average: sum / numbers.length,
      integers: numbers.every(Number.isInteger),
    };
  }
  if (dates.length > 0) {
    stats.dates = {
      min: new Date(Math.min(...dates)).toISOString(),
      max: new Date(Math.max(...dates)).toISOString(),
    };
  }
  return stats;
}

const isCategory = (stats: Stats) =>
  stats.distinct >= 2 &&
  stats.distinct <= MAX_CATEGORY_VALUES &&
  stats.distinct <= stats.filled * MAX_CATEGORY_RATIO;

/** The heuristic: the column's name and type first, then what its values look like. */
function roleOf(column: ColumnMeta, stats: Stats): ColumnRole {
  const allDistinct = stats.filled > 0 && stats.distinct === stats.filled;
  const named = IDENTIFIER_NAME_RE.test(column.name);
  switch (column.type) {
    case "date":
      return "time";
    case "boolean":
      return "flag";
    case "number": {
      const numbers = stats.numbers;
      if (YEAR_NAME_RE.test(column.name)) return "year";
      if (
        numbers?.integers &&
        numbers.min >= YEAR_MIN &&
        numbers.max <= YEAR_MAX
      ) {
        return "year";
      }
      if (allDistinct && named) return "identifier";
      if (
        numbers?.integers &&
        allDistinct &&
        stats.filled >= MIN_IDENTIFIER_ROWS &&
        numbers.max - numbers.min + 1 <= stats.filled * MAX_SEQUENCE_SPREAD
      ) {
        return "identifier";
      }
      if (numbers?.integers && isCategory(stats)) return "category";
      return "measure";
    }
    case "string": {
      if (allDistinct && (named || stats.tokens)) return "identifier";
      if (isCategory(stats)) return "category";
      return "text";
    }
    default:
      return "other";
  }
}

/** Every column of the payload, profiled over its rows. */
export function profileColumns(
  payload: SheetPayloadLike,
  options: { topValues?: number } = {},
): ColumnProfile[] {
  const top = options.topValues ?? DEFAULT_TOP_VALUES;
  const frame = bindSheet(payload);
  return frame.columns.map((column) => {
    const key = column.name.trim().toLowerCase();
    const { tokens: _tokens, ...stats } = collect(frame.rows, key, top);
    return {
      name: column.name,
      type: column.type,
      role: roleOf(column, { ...stats, tokens: _tokens }),
      ...stats,
    };
  });
}
