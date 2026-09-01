import { shortColumnId, shortRowId } from "./spreadsheet.ids";
import type { CellValue, SheetColumn, SheetRow } from "./spreadsheet.schema";
import { toWireColumnType, toWireNodeType } from "./spreadsheet.schema";

// Pure assembly from database records to the nested wire shapes. No prisma
// imports — the services hand in already-selected records.

export type ColumnRecord = {
  index: number;
  sortOrder: number;
  name: string;
  type: string;
  node: string | null;
  prompt: string | null;
};
export type CellRecord = {
  rowIndex: number;
  columnIndex: number;
  value: unknown;
};

export function toSheetColumn(record: ColumnRecord): SheetColumn {
  return {
    id: shortColumnId(record.index),
    index: record.index,
    sortOrder: record.sortOrder,
    name: record.name,
    type: toWireColumnType(record.type),
    node: record.node === null ? null : toWireNodeType(record.node),
    prompt: record.prompt,
  };
}

/**
 * One nested row: an entry per stored cell, in the sheet's column order.
 *
 * `columns` arrives display-sorted (`columnsOf` orders by `sortOrder`), so the
 * entries follow the header rather than the raw index — those stopped being the
 * same thing when reordering landed. The `columnIndex` fallback only covers a
 * cell whose column is gone, which `removeColumn` makes impossible.
 */
export function buildRow(
  rowIndex: number,
  columns: ColumnRecord[],
  cells: CellRecord[],
): SheetRow {
  const names = new Map(columns.map((column) => [column.index, column.name]));
  const rank = new Map(
    columns.map((column, position) => [column.index, position]),
  );
  const rankOf = (columnIndex: number) => rank.get(columnIndex) ?? columnIndex;
  return {
    id: shortRowId(rowIndex),
    index: rowIndex,
    columns: cells
      .filter((cell) => cell.rowIndex === rowIndex)
      .sort((a, b) => rankOf(a.columnIndex) - rankOf(b.columnIndex))
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
