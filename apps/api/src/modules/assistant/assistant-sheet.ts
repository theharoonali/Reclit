import {
  applyFilters,
  bindSheet,
  type ColumnRole,
  normalizeName,
  profileColumns,
  type SheetPayloadLike,
  type WidgetFilter,
} from "@reclit/dashboard-engine";
import type {
  CellValue,
  ColumnTypeWire,
  SheetColumn,
  SheetRow,
} from "../spreadsheet/spreadsheet.schema";
import { isPlainObject } from "../spreadsheet/spreadsheet.schema";
import { ToolInputError } from "./assistant-tool-runtime";
import type { ToolCellScalar, ToolRowFilter } from "./assistant-tools";

// Pure helpers over a sheet payload, shared by the tool handlers and covered
// by the contract test without a database: naming a column the way the sheet
// does, picking rows by a rule through the engine's own filters, describing a
// column, and shaping a model value for a column type.

/** The column the model named, matched like the sheet matches names (trimmed, case-insensitive). */
export function resolveColumn<T extends { name: string }>(
  columns: readonly T[],
  name: string,
): T {
  const key = normalizeName(name);
  const column = columns.find(
    (candidate) => normalizeName(candidate.name) === key,
  );
  if (!column) {
    const known = columns.map((candidate) => `"${candidate.name}"`).join(", ");
    throw new ToolInputError(
      `There is no column "${name}". The columns are: ${known || "(none)"}`,
      "UNKNOWN_COLUMN",
    );
  }
  return column;
}

/** The flattened tool filter as the engine's filter (`in` takes the list). */
export function toWidgetFilter(filter: ToolRowFilter): WidgetFilter {
  if (filter.op === "in") {
    return { column: filter.column, op: "in", value: filter.values ?? [] };
  }
  return filter.value === undefined
    ? { column: filter.column, op: filter.op }
    : { column: filter.column, op: filter.op, value: filter.value };
}

/** The stored rows a rule selects, by index, through the engine's filters. */
export function selectRowIndexes(
  payload: SheetPayloadLike,
  where: ToolRowFilter,
): number[] {
  resolveColumn(payload.columns, where.column);
  const frame = bindSheet(payload);
  return applyFilters(frame.rows, [toWidgetFilter(where)]).map(
    (row) => row.index,
  );
}

export type ColumnSummary = {
  column: string;
  type: ColumnTypeWire;
  role: ColumnRole;
  storedRows: number;
  filled: number;
  blank: number;
  distinct: number;
  topValues: { value: string; count: number }[];
  numbers?: { min: number; max: number; sum: number; average: number };
  dates?: { min: string; max: string };
};

export const TOP_VALUES = 20;

/**
 * One column across every stored row — fill rate, cardinality and role, the
 * most common values, numeric or date range — as the `getColumnSummary` tool
 * answers it: the engine's profile of that one column, in the tool's shape.
 */
export function summariseColumn(
  rows: readonly SheetRow[],
  column: SheetColumn,
): ColumnSummary {
  const [profile] = profileColumns(
    { columns: [column], rows },
    { topValues: TOP_VALUES },
  );
  if (!profile) throw new Error("unreachable: one column in, one profile out");
  const summary: ColumnSummary = {
    column: column.name,
    type: column.type,
    role: profile.role,
    storedRows: profile.rows,
    filled: profile.filled,
    blank: profile.blank,
    distinct: profile.distinct,
    topValues: profile.topValues,
  };
  if (profile.numbers) {
    const { min, max, sum, average } = profile.numbers;
    summary.numbers = { min, max, sum, average };
  }
  if (profile.dates) summary.dates = profile.dates;
  return summary;
}

/**
 * A model value shaped for its column: a JSON string becomes the object a
 * json column stores, a numeric string a number, "true"/"false" a boolean, a
 * number a string for a text column. Anything else is left for the cells
 * service to validate (`SPREADSHEET_CELL_TYPE_MISMATCH` names the problem).
 */
export function coerceToolValue(
  value: ToolCellScalar,
  type: ColumnTypeWire,
): CellValue {
  if (value === null) return null;
  switch (type) {
    case "json": {
      if (typeof value !== "string") return value;
      try {
        const parsed: unknown = JSON.parse(value);
        return isPlainObject(parsed) ? parsed : value;
      } catch {
        return value;
      }
    }
    case "number": {
      if (typeof value !== "string" || value.trim() === "") return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }
    case "boolean": {
      if (typeof value !== "string") return value;
      const text = value.trim().toLowerCase();
      return text === "true" ? true : text === "false" ? false : value;
    }
    case "string":
    case "formula":
      return typeof value === "string" ? value : String(value);
    default:
      return value;
  }
}
