import type { Expr } from "./formula/ast";
import type { AggregateName } from "./formula/functions";
import type { ColumnProfile, ColumnRole } from "./profile";
import { normalizeName } from "./sheet";
import type { WidgetQuery } from "./widget";

/**
 * What `verifyDashboard` reads off a card's *query* — before it runs — as
 * opposed to its result: which aggregates it applies to which columns, and
 * the canonical forms two cards are compared by.
 */

/** Aggregates that only mean something over a quantity. */
const MEASURE_AGGREGATES: readonly AggregateName[] = [
  "SUM",
  "AVG",
  "MIN",
  "MAX",
];
/** Roles that are labels, not quantities, whatever their type. */
const NON_MEASURE_ROLES: readonly ColumnRole[] = [
  "identifier",
  "year",
  "time",
  "text",
];

/** Profiles keyed by `normalizeName(column.name)`. */
export type Profiles = Map<string, ColumnProfile>;

/** Every column a subtree reads, by normalised key. */
function refsOf(expr: Expr, out: string[] = []): string[] {
  switch (expr.kind) {
    case "ref":
      out.push(expr.key);
      break;
    case "unary":
      refsOf(expr.operand, out);
      break;
    case "binary":
      refsOf(expr.left, out);
      refsOf(expr.right, out);
      break;
    case "call":
      for (const arg of expr.args) refsOf(arg, out);
      break;
    case "aggregate":
      if (expr.arg) refsOf(expr.arg, out);
      break;
  }
  return out;
}

/** The first SUM/AVG/MIN/MAX over a label column in the tree, if any. */
export function nonMeasureAggregate(
  expr: Expr,
  profiles: Profiles,
): { name: AggregateName; profile: ColumnProfile } | null {
  switch (expr.kind) {
    case "aggregate": {
      if (!expr.arg || !MEASURE_AGGREGATES.includes(expr.name)) return null;
      for (const key of refsOf(expr.arg)) {
        const profile = profiles.get(key);
        if (profile && NON_MEASURE_ROLES.includes(profile.role)) {
          return { name: expr.name, profile };
        }
      }
      return null;
    }
    case "unary":
      return nonMeasureAggregate(expr.operand, profiles);
    case "binary":
      return (
        nonMeasureAggregate(expr.left, profiles) ??
        nonMeasureAggregate(expr.right, profiles)
      );
    case "call":
      for (const arg of expr.args) {
        const found = nonMeasureAggregate(arg, profiles);
        if (found) return found;
      }
      return null;
    default:
      return null;
  }
}

/** `COUNT({col})` / `COUNT_DISTINCT({col})` and nothing else: the column. */
export function countedColumn(expr: Expr): string | null {
  if (expr.kind !== "aggregate" || expr.arg?.kind !== "ref") return null;
  const counts = expr.name === "COUNT" || expr.name === "COUNT_DISTINCT";
  return counts ? expr.arg.key : null;
}

/**
 * The query with names normalised, formulas trimmed and order kept, so two
 * cards that mean the same thing serialise the same.
 */
export function canonicalQuery(query: WidgetQuery): string {
  return JSON.stringify({
    filters: query.filters.map((filter) => ({
      column: normalizeName(filter.column),
      op: filter.op,
      value: filter.value ?? null,
    })),
    groupBy: query.groupBy
      ? {
          column: normalizeName(query.groupBy.column),
          bucket: query.groupBy.bucket,
        }
      : null,
    splitBy: query.splitBy
      ? {
          column: normalizeName(query.splitBy.column),
          bucket: query.splitBy.bucket ?? "none",
          limit: query.splitBy.limit ?? null,
        }
      : null,
    series: query.series.map((series) => series.formula.trim()),
    sort: query.sort ?? null,
    limit: query.limit ?? null,
    compare: query.compare?.formula.trim() ?? null,
  });
}

/** The groupBy as one comparable string; empty without one. */
export const groupKeyOf = (query: WidgetQuery): string =>
  query.groupBy
    ? `${normalizeName(query.groupBy.column)}:${query.groupBy.bucket}`
    : "";

/** The set of series formulas, trimmed and case-folded, as one sortable string. */
export const formulasOf = (query: WidgetQuery): string =>
  JSON.stringify(
    [
      ...new Set(query.series.map((s) => s.formula.trim().toLowerCase())),
    ].sort(),
  );
