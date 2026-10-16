import { compare, equals, toText, type Value } from "../formula/values";
import { type BoundRow, normalizeName } from "../sheet";
import type { FilterValue, WidgetFilter } from "../widget";

/**
 * Row filters. A blank cell matches only `isEmpty`: every ordering and
 * equality test is false on null (the formula engine's own rule), so a
 * `neq` never sweeps blanks in by accident.
 */

const scalar = (value: FilterValue | undefined): Value =>
  value === undefined || Array.isArray(value) ? null : value;

function matches(value: Value, filter: WidgetFilter): boolean {
  switch (filter.op) {
    case "isEmpty":
      return value === null || value === "";
    case "notEmpty":
      return value !== null && value !== "";
    case "in":
      return (
        Array.isArray(filter.value) &&
        filter.value.some((candidate) => equals(value, candidate) === true)
      );
    case "contains":
      return (
        value !== null &&
        toText(value)
          .toLowerCase()
          .includes(toText(scalar(filter.value)).toLowerCase())
      );
    case "eq":
      return equals(value, scalar(filter.value)) === true;
    case "neq":
      return equals(value, scalar(filter.value)) === false;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const order = compare(value, scalar(filter.value));
      if (order === null) return false;
      switch (filter.op) {
        case "gt":
          return order > 0;
        case "gte":
          return order >= 0;
        case "lt":
          return order < 0;
        default:
          return order <= 0;
      }
    }
  }
}

export function applyFilters(
  rows: readonly BoundRow[],
  filters: readonly WidgetFilter[],
): BoundRow[] {
  if (filters.length === 0) return [...rows];
  const compiled = filters.map((filter) => ({
    key: normalizeName(filter.column),
    filter,
  }));
  return rows.filter((row) =>
    compiled.every(({ key, filter }) => matches(row.scope.get(key), filter)),
  );
}
