import type { RowScope, Value } from "./formula/values";

/**
 * Binds a `spreadsheet.rows` payload to the formula engine: columns by
 * normalised name, and every row as a `RowScope` the evaluator reads cells
 * from. Typed once here — a `date` column becomes a `Date`, a `json` cell a
 * string — so formulas, filters and buckets all see the same values.
 */

/** A column as the engine needs it: its name and its wire type. */
export type ColumnMeta = { name: string; type: string };

/** The structural subset of `SheetPayload` the engine reads. */
export type SheetPayloadLike = {
  columns: readonly ColumnMeta[];
  rows: readonly {
    id: string;
    index: number;
    columns: readonly { name: string; value: unknown }[];
  }[];
};

export type BoundRow = { id: string; index: number; scope: RowScope };

export type SheetFrame = {
  columns: ColumnMeta[];
  rows: BoundRow[];
  /** Keyed by `normalizeName(column.name)`. */
  columnByName: Map<string, ColumnMeta>;
};

/** Column names match trimmed and case-insensitively, as the API enforces. */
export const normalizeName = (name: string): string =>
  name.trim().toLowerCase();

/** A cell as the engine sees it, by column type. Unreadable values are null. */
export function bindValue(value: unknown, type: string): Value {
  if (value === null || value === undefined) return null;
  if (type === "date") {
    const parsed =
      typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
    return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  switch (typeof value) {
    case "number":
      return Number.isFinite(value) ? value : null;
    case "string":
    case "boolean":
      return value;
    case "object":
      return JSON.stringify(value);
    default:
      return null;
  }
}

export function bindSheet(payload: SheetPayloadLike): SheetFrame {
  const columns = payload.columns.map(({ name, type }) => ({ name, type }));
  const columnByName = new Map<string, ColumnMeta>();
  for (const column of columns) {
    columnByName.set(normalizeName(column.name), column);
  }

  const rows = payload.rows.map((row) => {
    const cells = new Map<string, Value>();
    for (const entry of row.columns) {
      const key = normalizeName(entry.name);
      const column = columnByName.get(key);
      if (!column) continue;
      cells.set(key, bindValue(entry.value, column.type));
    }
    const scope: RowScope = { get: (key) => cells.get(key) ?? null };
    return { id: row.id, index: row.index, scope };
  });

  return { columns, rows, columnByName };
}
