import type { CellValue, SheetModel } from "./types";
import { cellKey } from "./types";

/**
 * Serialises the in-memory model to CSV. Pure — no DOM, no fetching — so the
 * download mechanics stay with the component and this can be unit-tested.
 *
 * Values are exported raw (unlocalised numbers, ISO dates, stringified JSON)
 * rather than display-formatted, so the file round-trips through the existing
 * importer. `editableText` is deliberately not reused: it returns "" for JSON
 * cells, which would silently drop them.
 */

/** RFC 4180: quote iff the field holds a quote, comma or line break. */
export function csvField(text: string): string {
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvCellText(value: CellValue): string {
  if (value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Header row of column names, then every stored row in ascending index. Rows
 * are the union of stored row records and rows holding at least one cell —
 * the same walk `storedRows` does in `use-sheet-selection.ts`. The gaps
 * between sparse rows are skipped, matching what an import produces.
 */
export function sheetToCsv(model: SheetModel): string {
  const rows = new Set<number>(model.rowIds.keys());
  for (const key of model.cells.keys()) {
    const row = Number.parseInt(key, 10);
    if (Number.isInteger(row)) rows.add(row);
  }

  const lines = [
    model.columns.map((column) => csvField(column.name)).join(","),
  ];
  for (const row of [...rows].sort((a, b) => a - b)) {
    lines.push(
      model.columns
        .map((column) =>
          csvField(
            csvCellText(model.cells.get(cellKey(row, column.id)) ?? null),
          ),
        )
        .join(","),
    );
  }
  return lines.join("\r\n");
}
