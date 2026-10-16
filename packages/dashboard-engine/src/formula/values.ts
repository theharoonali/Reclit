/**
 * The value model every formula computes over, and the coercions that decide
 * what `{Revenue} > "100"` or `{Signed} >= "2026-01-01"` mean. Null is a blank
 * cell and poisons arithmetic and comparisons (SQL semantics), so a formula
 * never turns a blank into a zero by accident — `COALESCE` does that on
 * purpose.
 */

export type Value = null | number | string | boolean | Date;

/** How the evaluator reads a cell: by the column's normalised name. */
export type RowScope = { get(key: string): Value };

export function toNumber(value: Value): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toText(value: Value): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function isTruthy(value: Value): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "";
  return true;
}

export function parseDate(text: string): Date | null {
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** Lifts a string beside a Date to a Date, so a date column compares with a literal. */
function align(a: Value, b: Value): [Value, Value] {
  if (a instanceof Date && typeof b === "string") return [a, parseDate(b) ?? b];
  if (b instanceof Date && typeof a === "string") return [parseDate(a) ?? a, b];
  return [a, b];
}

/** `null` when either side is blank; strings compare exactly, the rest as numbers. */
export function equals(left: Value, right: Value): boolean | null {
  if (left === null || right === null) return null;
  const [a, b] = align(left, right);
  if (typeof a === "string" && typeof b === "string") return a === b;
  const x = toNumber(a);
  const y = toNumber(b);
  if (x !== null && y !== null) return x === y;
  return toText(a) === toText(b);
}

/** -1 / 0 / 1, or `null` when either side is blank or the pair is incomparable. */
export function compare(left: Value, right: Value): number | null {
  if (left === null || right === null) return null;
  const [a, b] = align(left, right);
  if (typeof a === "string" && typeof b === "string") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (x === null || y === null) return null;
  return x < y ? -1 : x > y ? 1 : 0;
}
