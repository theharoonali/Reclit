import type { Prisma } from "../../../generated/prisma/client";
import { isUniqueViolation } from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import {
  SpreadsheetCellTypeMismatchError,
  SpreadsheetColumnNotFoundError,
  SpreadsheetColumnNotLastError,
  SpreadsheetPromptWithoutNodeError,
  SpreadsheetRowExistsError,
} from "./spreadsheet.errors";
import {
  cellId,
  columnId,
  rowId,
  shortCellId,
  shortColumnId,
  shortRowId,
} from "./spreadsheet.ids";
import type {
  AppendRowInput,
  CellValue,
  CreateColumnInput,
  CreateRowInput,
  RemoveRowsInput,
  SetCellInput,
  SheetCell,
  SheetColumn,
  SheetRow,
  UpdateColumnInput,
  UpdateRowInput,
} from "./spreadsheet.schema";
import {
  cellValueMatchesType,
  toDbColumnType,
  toDbNodeType,
  toWireColumnType,
} from "./spreadsheet.schema";
import { columnSelect, spreadsheetService } from "./spreadsheet.service";
import type { ColumnRecord } from "./spreadsheet.shape";
import { toSheetColumn } from "./spreadsheet.shape";

// Framework-free (see spreadsheet.service.ts). Grid writes live here; the
// split keeps both services inside the size caps (docs/rules/COMMON.md §5).
// Lookups are reused from `spreadsheetService`, never re-implemented.

// Zod cannot express Prisma.InputJsonValue exactly; the runtime shapes match.
const toJsonInput = (value: Exclude<CellValue, null>): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

/** Throws unless `value` fits the column's declared type. */
function assertValueFits(value: CellValue, dbType: string): void {
  const wireType = toWireColumnType(dbType);
  if (!cellValueMatchesType(value, wireType)) {
    throw new SpreadsheetCellTypeMismatchError(wireType, value);
  }
}

export class SpreadsheetCellsService {
  /**
   * The scoped pks make this a single upsert pair with no prior cell lookup:
   * the column read both validates the type and proves the sheet exists.
   * `value: null` clears (deletes) the cell.
   */
  async setCell({
    id,
    rowIndex,
    columnIndex,
    value,
  }: SetCellInput): Promise<SheetCell> {
    const column = await spreadsheetService.columnOrThrow(id, columnIndex);
    assertValueFits(value, column.type);
    if (value === null) {
      await prisma.cell.deleteMany({
        where: { id: cellId(id, rowIndex, columnIndex) },
      });
    } else {
      const rid = rowId(id, rowIndex);
      const cid = cellId(id, rowIndex, columnIndex);
      await prisma.$transaction([
        prisma.row.upsert({
          where: { id: rid },
          create: { id: rid, spreadsheetId: id, index: rowIndex },
          update: {},
        }),
        prisma.cell.upsert({
          where: { id: cid },
          create: {
            id: cid,
            spreadsheetId: id,
            rowIndex,
            columnIndex,
            value: toJsonInput(value),
          },
          update: { value: toJsonInput(value) },
        }),
      ]);
    }
    return {
      id: shortCellId(rowIndex, columnIndex),
      rowIndex,
      columnIndex,
      value,
    };
  }

  /** Throws unless every entry targets an existing column with a fitting value. */
  private assertCellsFit(
    columns: ColumnRecord[],
    cells: { columnIndex: number; value: CellValue }[],
  ): void {
    const byIndex = new Map(columns.map((column) => [column.index, column]));
    for (const entry of cells) {
      const column = byIndex.get(entry.columnIndex);
      if (!column) throw new SpreadsheetColumnNotFoundError(entry.columnIndex);
      assertValueFits(entry.value, column.type);
    }
  }

  /** Batch of cell writes on one row, validated up front, in one transaction. */
  async updateRow({ id, rowIndex, cells }: UpdateRowInput): Promise<SheetRow> {
    await spreadsheetService.byId(id);
    const columns = await spreadsheetService.columnsOf(id);
    this.assertCellsFit(columns, cells);
    const rid = rowId(id, rowIndex);
    await prisma.$transaction([
      prisma.row.upsert({
        where: { id: rid },
        create: { id: rid, spreadsheetId: id, index: rowIndex },
        update: {},
      }),
      ...cells.map(({ columnIndex, value }) => {
        const cid = cellId(id, rowIndex, columnIndex);
        return value === null
          ? prisma.cell.deleteMany({ where: { id: cid } })
          : prisma.cell.upsert({
              where: { id: cid },
              create: {
                id: cid,
                spreadsheetId: id,
                rowIndex,
                columnIndex,
                value: toJsonInput(value),
              },
              update: { value: toJsonInput(value) },
            });
      }),
    ]);
    return spreadsheetService.row(id, rowIndex);
  }

  /**
   * Appends a row at one past the highest stored index, writing its cells in
   * the same transaction. The index race with concurrent appends is retried
   * internally; `value: null` entries write no cell (a row is sparse).
   */
  async appendRow({ id, cells }: AppendRowInput): Promise<SheetRow> {
    await spreadsheetService.byId(id);
    const columns = await spreadsheetService.columnsOf(id);
    this.assertCellsFit(columns, cells);
    const writes = cells.filter(
      (
        entry,
      ): entry is { columnIndex: number; value: Exclude<CellValue, null> } =>
        entry.value !== null,
    );
    const MAX_ATTEMPTS = 3;
    let target = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      target =
        ((
          await prisma.row.aggregate({
            where: { spreadsheetId: id },
            _max: { index: true },
          })
        )._max.index ?? -1) + 1;
      try {
        await prisma.$transaction([
          prisma.row.create({
            data: { id: rowId(id, target), spreadsheetId: id, index: target },
          }),
          ...writes.map(({ columnIndex, value }) =>
            prisma.cell.create({
              data: {
                id: cellId(id, target, columnIndex),
                spreadsheetId: id,
                rowIndex: target,
                columnIndex,
                value: toJsonInput(value),
              },
            }),
          ),
        ]);
        return spreadsheetService.row(id, target);
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new SpreadsheetRowExistsError(target);
  }

  /** `index` defaults to one past the highest stored row. */
  async createRow({ id, index }: CreateRowInput): Promise<SheetRow> {
    await spreadsheetService.byId(id);
    const target =
      index ??
      ((
        await prisma.row.aggregate({
          where: { spreadsheetId: id },
          _max: { index: true },
        })
      )._max.index ?? -1) + 1;
    try {
      await prisma.row.create({
        data: { id: rowId(id, target), spreadsheetId: id, index: target },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new SpreadsheetRowExistsError(target);
      throw error;
    }
    return { id: shortRowId(target), index: target, columns: [] };
  }

  /**
   * Row indexes are absolute grid positions, not ordinals: deleting a row
   * clears it and never shifts later rows, so ids never renumber. Idempotent.
   */
  async removeRow(id: string, rowIndex: number): Promise<{ id: string }> {
    await spreadsheetService.byId(id);
    await prisma.$transaction([
      prisma.cell.deleteMany({ where: { spreadsheetId: id, rowIndex } }),
      prisma.row.deleteMany({ where: { id: rowId(id, rowIndex) } }),
    ]);
    return { id: shortRowId(rowIndex) };
  }

  /** Append-only: the new column's index is always the current column count. */
  async createColumn({
    id,
    name,
    type,
    node,
    prompt,
  }: CreateColumnInput): Promise<SheetColumn> {
    await spreadsheetService.byId(id);
    const index = await prisma.column.count({ where: { spreadsheetId: id } });
    const record = await prisma.column.create({
      data: {
        id: columnId(id, index),
        spreadsheetId: id,
        index,
        name,
        type: toDbColumnType(type),
        node: node === null ? null : toDbNodeType(node),
        prompt,
      },
      select: columnSelect,
    });
    return toSheetColumn(record);
  }

  /**
   * Changing `type` does not convert or revalidate stored cells. `undefined`
   * leaves a field unchanged, `null` clears it; clearing `node` also clears
   * `prompt`, and the effective pair may never be prompt-without-node.
   */
  async updateColumn({
    id,
    columnIndex,
    name,
    type,
    node,
    prompt,
  }: UpdateColumnInput): Promise<SheetColumn> {
    const stored = await spreadsheetService.columnOrThrow(id, columnIndex);
    const effectiveNode = node !== undefined ? node : stored.node;
    // An explicit prompt always counts; otherwise clearing the node clears it.
    const effectivePrompt =
      prompt !== undefined ? prompt : node === null ? null : stored.prompt;
    if (effectiveNode === null && effectivePrompt !== null) {
      throw new SpreadsheetPromptWithoutNodeError();
    }
    const record = await prisma.column.update({
      where: { id: columnId(id, columnIndex) },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type: toDbColumnType(type) }),
        ...(node !== undefined && {
          node: node === null ? null : toDbNodeType(node),
        }),
        ...(prompt !== undefined && { prompt }),
        ...(node === null && { prompt: null }),
      },
      select: columnSelect,
    });
    return toSheetColumn(record);
  }

  /**
   * `removeRow` for a batch: clears every listed row and its cells in one
   * transaction. Same semantics — absolute positions, nothing shifts, and an
   * index that holds no stored row is a no-op rather than an error.
   */
  async removeRows({
    id,
    rowIndexes,
  }: RemoveRowsInput): Promise<{ ids: string[] }> {
    await spreadsheetService.byId(id);
    const unique = [...new Set(rowIndexes)];
    await prisma.$transaction([
      prisma.cell.deleteMany({
        where: { spreadsheetId: id, rowIndex: { in: unique } },
      }),
      prisma.row.deleteMany({
        where: { spreadsheetId: id, index: { in: unique } },
      }),
    ]);
    return { ids: unique.map(shortRowId) };
  }

  /**
   * Only the last column can be deleted — an interior delete would leave a
   * hole or force renumbering every column and cell pk after it.
   */
  async removeColumn(id: string, columnIndex: number): Promise<{ id: string }> {
    await spreadsheetService.columnOrThrow(id, columnIndex);
    const count = await prisma.column.count({ where: { spreadsheetId: id } });
    if (columnIndex !== count - 1) {
      throw new SpreadsheetColumnNotLastError(columnIndex, count - 1);
    }
    await prisma.$transaction([
      prisma.cell.deleteMany({ where: { spreadsheetId: id, columnIndex } }),
      prisma.column.delete({ where: { id: columnId(id, columnIndex) } }),
    ]);
    return { id: shortColumnId(columnIndex) };
  }
}

export const spreadsheetCellsService = new SpreadsheetCellsService();
