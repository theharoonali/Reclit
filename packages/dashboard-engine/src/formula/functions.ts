import { isTruthy, toNumber, toText, type Value } from "./values";

/**
 * The function vocabulary. Row functions see one row's values; aggregates see
 * every row of the group. The tables are what the parser checks names and
 * arities against, so adding a function is one entry plus one case.
 */

type Arity = { min: number; max: number };

export const ROW_FUNCTIONS = {
  IF: { min: 2, max: 3 },
  ABS: { min: 1, max: 1 },
  ROUND: { min: 1, max: 2 },
  FLOOR: { min: 1, max: 1 },
  CEIL: { min: 1, max: 1 },
  COALESCE: { min: 1, max: Number.POSITIVE_INFINITY },
  LEN: { min: 1, max: 1 },
  LOWER: { min: 1, max: 1 },
  UPPER: { min: 1, max: 1 },
  TRIM: { min: 1, max: 1 },
} as const satisfies Record<string, Arity>;
export type RowFunctionName = keyof typeof ROW_FUNCTIONS;

export const AGGREGATE_FUNCTIONS = {
  SUM: { min: 1, max: 1 },
  AVG: { min: 1, max: 1 },
  MIN: { min: 1, max: 1 },
  MAX: { min: 1, max: 1 },
  COUNT: { min: 0, max: 1 },
  COUNT_DISTINCT: { min: 1, max: 1 },
  FIRST: { min: 1, max: 1 },
  LAST: { min: 1, max: 1 },
} as const satisfies Record<string, Arity>;
export type AggregateName = keyof typeof AGGREGATE_FUNCTIONS;

export const isRowFunction = (name: string): name is RowFunctionName =>
  Object.hasOwn(ROW_FUNCTIONS, name);
export const isAggregateFunction = (name: string): name is AggregateName =>
  Object.hasOwn(AGGREGATE_FUNCTIONS, name);

const numeric = (value: Value, fn: (n: number) => number): Value => {
  const n = toNumber(value);
  return n === null ? null : fn(n);
};

const text = (value: Value, fn: (s: string) => Value): Value =>
  value === null ? null : fn(toText(value));

export function applyRowFunction(name: RowFunctionName, args: Value[]): Value {
  const [a = null, b = null, c = null] = args;
  switch (name) {
    case "IF":
      return isTruthy(a) ? b : c;
    case "ABS":
      return numeric(a, Math.abs);
    case "ROUND": {
      const places = toNumber(b) ?? 0;
      const factor = 10 ** Math.max(0, Math.trunc(places));
      return numeric(a, (n) => Math.round(n * factor) / factor);
    }
    case "FLOOR":
      return numeric(a, Math.floor);
    case "CEIL":
      return numeric(a, Math.ceil);
    case "COALESCE":
      return args.find((value) => value !== null) ?? null;
    case "LEN":
      return text(a, (s) => s.length);
    case "LOWER":
      return text(a, (s) => s.toLowerCase());
    case "UPPER":
      return text(a, (s) => s.toUpperCase());
    case "TRIM":
      return text(a, (s) => s.trim());
  }
}

const distinctKey = (value: Value): string =>
  value instanceof Date
    ? `date:${value.getTime()}`
    : `${typeof value}:${String(value)}`;

/** Numbers of the non-blank values; a Date counts by its ms. */
function numbers(values: Value[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    const n = toNumber(value);
    if (n !== null) out.push(n);
  }
  return out;
}

/** MIN/MAX keep a date a date: the extreme of a date column is a Date, not ms. */
function extreme(values: Value[], pick: (ns: number[]) => number): Value {
  const ns = numbers(values);
  if (ns.length === 0) return null;
  const result = pick(ns);
  const sample = values.find((value) => value !== null);
  return sample instanceof Date ? new Date(result) : result;
}

/**
 * `values` holds the argument evaluated per row, or `null` for the zero-arity
 * `COUNT()`, which counts `rowCount` rows instead.
 */
export function applyAggregate(
  name: AggregateName,
  values: Value[] | null,
  rowCount: number,
): Value {
  if (values === null) return name === "COUNT" ? rowCount : null;
  switch (name) {
    case "SUM":
      return numbers(values).reduce((sum, n) => sum + n, 0);
    case "AVG": {
      const ns = numbers(values);
      return ns.length === 0
        ? null
        : ns.reduce((sum, n) => sum + n, 0) / ns.length;
    }
    case "MIN":
      return extreme(values, (ns) => Math.min(...ns));
    case "MAX":
      return extreme(values, (ns) => Math.max(...ns));
    case "COUNT":
      return values.filter((value) => value !== null).length;
    case "COUNT_DISTINCT":
      return new Set(values.filter((value) => value !== null).map(distinctKey))
        .size;
    case "FIRST":
      return values.find((value) => value !== null) ?? null;
    case "LAST": {
      for (let i = values.length - 1; i >= 0; i -= 1) {
        const value = values[i];
        if (value !== null && value !== undefined) return value;
      }
      return null;
    }
  }
}
