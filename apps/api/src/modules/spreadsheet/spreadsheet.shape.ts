import { shortCellId, shortColumnId, shortRowId } from "./spreadsheet.ids";
import type {
  CellValue,
  NodeConfig,
  SheetCell,
  SheetColumn,
  SheetRow,
  SheetRowCell,
} from "./spreadsheet.schema";
import {
  nodeConfigSchema,
  toWireColumnType,
  toWireNodeType,
} from "./spreadsheet.schema";

// Pure assembly from database records to the nested wire shapes. No prisma
// imports — the services hand in already-selected records.

export type ColumnRecord = {
  index: number;
  sortOrder: number;
  name: string;
  type: string;
  node: string | null;
  prompt: string | null;
  /**
   * `Column.config` as the database holds it — validated on write, not here.
   * Optional so a record built for a column that cannot carry one (an import)
   * need not spell out an absence.
   */
  config?: unknown;
};
export type CellRecord = {
  rowIndex: number;
  columnIndex: number;
  value: unknown;
};

export function toSheetCell(
  rowIndex: number,
  columnIndex: number,
  value: CellValue,
): SheetCell {
  return {
    id: shortCellId(rowIndex, columnIndex),
    rowIndex,
    columnIndex,
    value,
  };
}

export function toSheetColumn(record: ColumnRecord): SheetColumn {
  return {
    id: shortColumnId(record.index),
    index: record.index,
    sortOrder: record.sortOrder,
    name: record.name,
    type: toWireColumnType(record.type),
    node: record.node === null ? null : toWireNodeType(record.node),
    prompt: record.prompt,
    config: toNodeConfig(record.config),
  };
}

/**
 * `Column.config` on its way out. It was validated by `nodeConfigSchema` on
 * write, so anything unreadable now is a hand-edited row or a config left
 * behind by an older shape — it degrades to `null` rather than failing the
 * whole sheet read.
 */
export function toNodeConfig(config: unknown): NodeConfig | null {
  if (config === null || config === undefined) return null;
  const parsed = nodeConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
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

/**
 * The whole row, one entry per column in the order `columns` arrives (display
 * order from `columnsOf`), blank cells as `value: null`. This is the shape an
 * AI run reads: every column, sorted, typed and named — never just the cells
 * that happen to be stored.
 */
export function buildRowCells(
  columns: ColumnRecord[],
  cells: CellRecord[],
): SheetRowCell[] {
  const values = new Map(cells.map((cell) => [cell.columnIndex, cell.value]));
  return columns.map((column) => ({
    id: shortColumnId(column.index),
    index: column.index,
    name: column.name,
    type: toWireColumnType(column.type),
    value: (values.get(column.index) ?? null) as CellValue,
  }));
}
