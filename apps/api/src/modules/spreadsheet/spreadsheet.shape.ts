import { shortColumnId, shortRowId } from "./spreadsheet.ids";
import type { CellValue, SheetColumn, SheetRow } from "./spreadsheet.schema";
import { toWireColumnType } from "./spreadsheet.schema";

// Pure assembly from database records to the nested wire shapes. No prisma
// imports — the services hand in already-selected records.

export type ColumnRecord = { index: number; name: string; type: string };
export type CellRecord = {
  rowIndex: number;
  columnIndex: number;
  value: unknown;
};

export function toSheetColumn(record: ColumnRecord): SheetColumn {
  return {
    id: shortColumnId(record.index),
    index: record.index,
    name: record.name,
    type: toWireColumnType(record.type),
  };
}

/** One nested row: an entry per stored cell, ordered by column index. */
export function buildRow(
  rowIndex: number,
  columns: ColumnRecord[],
  cells: CellRecord[],
): SheetRow {
  const names = new Map(columns.map((column) => [column.index, column.name]));
  return {
    id: shortRowId(rowIndex),
    index: rowIndex,
    columns: cells
      .filter((cell) => cell.rowIndex === rowIndex)
      .sort((a, b) => a.columnIndex - b.columnIndex)
      .map((cell) => ({
        id: shortColumnId(cell.columnIndex),
        name: names.get(cell.columnIndex) ?? "",
        value: cell.value as CellValue,
      })),
  };
}

export function assembleRows(
  columns: ColumnRecord[],
  rowIndexes: number[],
  cells: CellRecord[],
): SheetRow[] {
  return rowIndexes.map((index) => buildRow(index, columns, cells));
}
