import type { Prisma } from "../../../generated/prisma/client";
import { toJsonInput } from "../../db/prisma";
import { cellId, columnId, rowId } from "./spreadsheet.ids";
import { toDbColumnType } from "./spreadsheet.schema";
import type { ColumnRecord } from "./spreadsheet.shape";
import type { InferredSheet } from "./spreadsheet-import.infer";
import type { MergePlan } from "./spreadsheet-import.plan";

// The `createMany` payloads an import writes. The scoped ids are pure
// functions of `(sheetId, index)`, so neither write needs lookups or upserts.

/** Postgres caps a statement at 65535 bind parameters; a Cell costs ~6. */
const CREATE_CHUNK = 2_000;

export function chunk<T>(items: T[]): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / CREATE_CHUNK) },
    (_, index) => items.slice(index * CREATE_CHUNK, (index + 1) * CREATE_CHUNK),
  );
}

/** Every record of a brand-new grid (onboarding's `replaceAll`). */
export function buildRecords(id: string, plan: InferredSheet) {
  // File order is already dense, so `index` and `sortOrder` start out equal —
  // they only diverge once a column is removed or reordered. Imported columns
  // never carry a node, so they carry no prompt either (left unset, which is
  // SQL NULL).
  const columnData = plan.columns.map((column, index) => ({
    id: columnId(id, index),
    spreadsheetId: id,
    index,
    sortOrder: index,
    name: column.name,
    type: toDbColumnType(column.type),
    node: null,
    prompt: null,
  }));

  // A Row record for every data row index, blank ones included: the row existed
  // in the file, and `spreadsheet.rows` pages *stored* rows.
  const rowData = plan.cells.map((_, index) => ({
    id: rowId(id, index),
    spreadsheetId: id,
    index,
  }));

  const cellData: Prisma.CellCreateManyInput[] = [];
  for (const [rowIndex, row] of plan.cells.entries()) {
    for (const [columnIndex, value] of row.entries()) {
      if (value === undefined) continue; // a blank cell writes no record
      cellData.push({
        id: cellId(id, rowIndex, columnIndex),
        spreadsheetId: id,
        rowIndex,
        columnIndex,
        value: toJsonInput(value),
      });
    }
  }

  return { columnData, rowData, cellData };
}

/**
 * The records a merge adds: new columns after the existing ones (by index and
 * by position), rows from `firstRow` on, and a cell for every non-blank value.
 * Nothing existing is rewritten.
 */
export function buildMergeRecords(
  id: string,
  existing: ColumnRecord[],
  plan: MergePlan,
  firstRow: number,
) {
  let nextIndex = Math.max(-1, ...existing.map((column) => column.index)) + 1;
  let nextSort =
    Math.max(-1, ...existing.map((column) => column.sortOrder)) + 1;
  const columnData: Prisma.ColumnCreateManyInput[] = [];
  const cellData: Prisma.CellCreateManyInput[] = [];

  for (const column of plan.columns) {
    let columnIndex: number;
    if (column.target.kind === "existing") {
      columnIndex = column.target.record.index;
    } else {
      columnIndex = nextIndex++;
      columnData.push({
        id: columnId(id, columnIndex),
        spreadsheetId: id,
        index: columnIndex,
        sortOrder: nextSort++,
        name: column.target.name,
        type: toDbColumnType(column.target.type),
      });
    }
    for (const [offset, value] of column.values.entries()) {
      if (value === undefined) continue;
      const rowIndex = firstRow + offset;
      cellData.push({
        id: cellId(id, rowIndex, columnIndex),
        spreadsheetId: id,
        rowIndex,
        columnIndex,
        value: toJsonInput(value),
      });
    }
  }

  const rowData = Array.from({ length: plan.rowCount }, (_, offset) => ({
    id: rowId(id, firstRow + offset),
    spreadsheetId: id,
    index: firstRow + offset,
  }));
  return { columnData, rowData, cellData };
}
