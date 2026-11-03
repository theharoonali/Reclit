import type { CellValue, ColumnTypeWire } from "./spreadsheet.schema";
import { toWireColumnType } from "./spreadsheet.schema";
import type { ColumnRecord } from "./spreadsheet.shape";
import type { InferredSheet } from "./spreadsheet-import.infer";
import { coerceTo, uniqueName } from "./spreadsheet-import.infer";
import { matchColumns } from "./spreadsheet-import.match";

// How an import lands on a sheet that already has columns. Pure: the service
// hands in the sheet's columns and the parsed file, and gets back where every
// file column goes and the values it will write there. Preview and import
// both run this, so what the preview shows is what the import does.

export type MergeTarget =
  | { kind: "existing"; record: ColumnRecord }
  | { kind: "new"; name: string; type: ColumnTypeWire };

export type MergeColumn = {
  /** The column's name in the file (after `inferSheet` de-duplicated it). */
  source: string;
  target: MergeTarget;
  /** Non-blank file values that do not fit an existing column's type. */
  skippedValues: number;
  /** One per file row; `undefined` writes no cell. */
  values: (CellValue | undefined)[];
};

export type MergePlan = { columns: MergeColumn[]; rowCount: number };

/**
 * A file column whose name matches an existing column (see
 * `spreadsheet-import.match.ts`) fills that column, its values re-typed to the
 * column's type — a value that does not fit is left blank and counted, never
 * written as the wrong type. Every other file column becomes a new column
 * with its inferred type, renamed if the sheet already uses the name.
 */
export function planMerge(
  existing: ColumnRecord[],
  sheet: InferredSheet,
): MergePlan {
  const matches = matchColumns(
    sheet.columns.map((column) => column.name),
    existing.map((column) => column.name),
  );
  const taken = new Set(existing.map((column) => column.name.toLowerCase()));

  const columns = sheet.columns.map((column, index): MergeColumn => {
    const record = existing[matches[index] ?? -1];
    if (!record) {
      return {
        source: column.name,
        target: {
          kind: "new",
          name: uniqueName(column.name, taken),
          type: column.type,
        },
        skippedValues: 0,
        values: sheet.cells.map((row) => row[index]),
      };
    }
    const type = toWireColumnType(record.type);
    let skippedValues = 0;
    const values = sheet.raw.map((row) => {
      const raw = row[index] ?? "";
      if (raw === "") return undefined;
      const value = coerceTo(raw, type);
      if (value === undefined) skippedValues += 1;
      return value;
    });
    return {
      source: column.name,
      target: { kind: "existing", record },
      skippedValues,
      values,
    };
  });

  return { columns, rowCount: sheet.cells.length };
}
