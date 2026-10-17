import {
  applyFilters,
  bindSheet,
  normalizeName,
  type SheetPayloadLike,
  type WidgetFilter,
} from "@reclit/dashboard-engine";
import { truncateValue } from "../../ai/assistant-prompt";
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

const cellOf = (row: SheetRow, key: string): CellValue | undefined =>
  row.columns.find((entry) => normalizeName(entry.name) === key)?.value;

export type ColumnSummary = {
  column: string;
  type: ColumnTypeWire;
  storedRows: number;
  filled: number;
  blank: number;
  topValues: { value: string; count: number }[];
  numbers?: { min: number; max: number; sum: number; average: number };
  dates?: { min: string; max: string };
};

export const TOP_VALUES = 20;

/** One column across every stored row: fill rate, most common values, numeric or date range. */
export function summariseColumn(
  rows: readonly SheetRow[],
  column: SheetColumn,
): ColumnSummary {
  const key = normalizeName(column.name);
  const counts = new Map<string, number>();
  const numbers: number[] = [];
  const dates: number[] = [];
  let filled = 0;
  for (const row of rows) {
    const value = cellOf(row, key);
    if (value === undefined || value === null || value === "") continue;
    filled += 1;
    const text = truncateValue(value, 60);
    counts.set(text, (counts.get(text) ?? 0) + 1);
    if (column.type === "number" && typeof value === "number") {
      numbers.push(value);
    }
    if (column.type === "date" && typeof value === "string") {
      const time = Date.parse(value);
      if (Number.isFinite(time)) dates.push(time);
    }
  }
  const topValues = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_VALUES)
    .map(([value, count]) => ({ value, count }));
  const summary: ColumnSummary = {
    column: column.name,
    type: column.type,
    storedRows: rows.length,
    filled,
    blank: rows.length - filled,
    topValues,
  };
  if (numbers.length > 0) {
    const sum = numbers.reduce((total, value) => total + value, 0);
    summary.numbers = {
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      sum,
      average: sum / numbers.length,
    };
  }
  if (dates.length > 0) {
    summary.dates = {
      min: new Date(Math.min(...dates)).toISOString(),
      max: new Date(Math.max(...dates)).toISOString(),
    };
  }
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
