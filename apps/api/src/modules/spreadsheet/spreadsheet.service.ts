import type { Prisma } from "../../../generated/prisma/client";
import {
  isForeignKeyViolation,
  isRecordNotFound,
} from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import { WorkspaceNotFoundError } from "../workspace/workspace.errors";
import {
  SpreadsheetColumnNotFoundError,
  SpreadsheetNotFoundError,
} from "./spreadsheet.errors";
import { cellId, columnId, shortRowId } from "./spreadsheet.ids";
import type {
  CellValue,
  CreateSpreadsheetInput,
  SheetCell,
  SheetColumn,
  SheetPayload,
  SheetRow,
  SheetRowsInput,
  SpreadsheetMeta,
} from "./spreadsheet.schema";
import type { CellRecord, ColumnRecord } from "./spreadsheet.shape";
import { buildRow, toSheetCell, toSheetColumn } from "./spreadsheet.shape";

// Framework-free (docs/rules/BACKEND.md hard rule 1). Reads and the sheet
// lifecycle; writes are split by kind into spreadsheet-cells.service.ts,
// spreadsheet-columns.service.ts and spreadsheet-import.service.ts.

const metaSelect = {
  id: true,
  name: true,
  totalRows: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { columns: true } },
} as const;

export const columnSelect = {
  index: true,
  sortOrder: true,
  name: true,
  type: true,
  node: true,
  prompt: true,
  config: true,
} as const;

export const cellSelect = {
  rowIndex: true,
  columnIndex: true,
  value: true,
} as const;

type MetaRecord = Prisma.SpreadsheetGetPayload<{ select: typeof metaSelect }>;

function toMeta(record: MetaRecord): SpreadsheetMeta {
  const { _count, ...rest } = record;
  return { ...rest, totalColumns: _count.columns };
}

export class SpreadsheetService {
  async list(): Promise<SpreadsheetMeta[]> {
    const records = await prisma.spreadsheet.findMany({
      select: metaSelect,
      orderBy: { createdAt: "desc" },
    });
    return records.map(toMeta);
  }

  async byId(id: string): Promise<SpreadsheetMeta> {
    const record = await prisma.spreadsheet.findUnique({
      where: { id },
      select: metaSelect,
    });
    if (!record) throw new SpreadsheetNotFoundError(id);
    return toMeta(record);
  }

  async create(input: CreateSpreadsheetInput): Promise<SpreadsheetMeta> {
    try {
      const record = await prisma.spreadsheet.create({
        data: {
          name: input.name,
          totalRows: input.totalRows,
          workspaceId: input.workspaceId,
        },
        select: metaSelect,
      });
      return toMeta(record);
    } catch (error) {
      if (isForeignKeyViolation(error))
        throw new WorkspaceNotFoundError(input.workspaceId);
      throw error;
    }
  }

  async remove(id: string): Promise<{ id: string }> {
    try {
      await prisma.spreadsheet.delete({ where: { id } });
      return { id };
    } catch (error) {
      if (isRecordNotFound(error)) throw new SpreadsheetNotFoundError(id);
      throw error;
    }
  }

  async rows({ id, startRow, limit }: SheetRowsInput): Promise<SheetPayload> {
    const meta = await this.byId(id);
    const columns = await this.columnsOf(id);
    // take limit + 1: the extra record only proves there is a next page.
    const rowRecords = await prisma.row.findMany({
      where: { spreadsheetId: id, index: { gte: startRow } },
      orderBy: { index: "asc" },
      take: limit + 1,
      select: { index: true },
    });
    const hasMore = rowRecords.length > limit;
    const visible = hasMore ? rowRecords.slice(0, limit) : rowRecords;
    const indexes = visible.map((row) => row.index);
    const cells = indexes.length
      ? await prisma.cell.findMany({
          where: { spreadsheetId: id, rowIndex: { in: indexes } },
          select: cellSelect,
        })
      : [];
    return {
      spreadsheet: {
        id: meta.id,
        name: meta.name,
        totalRows: meta.totalRows,
        totalColumns: meta.totalColumns,
      },
      columns: columns.map(toSheetColumn),
      rows: indexes.map((index) => buildRow(index, columns, cells)),
      pagination: {
        startRow,
        limit,
        hasMore,
        nextCursor:
          hasMore && rowRecords[limit] !== undefined
            ? shortRowId(rowRecords[limit].index)
            : null,
      },
    };
  }

  /** A row that was never written comes back blank: `columns: []`. */
  async row(id: string, rowIndex: number): Promise<SheetRow> {
    await this.byId(id);
    const columns = await this.columnsOf(id);
    const cells = await prisma.cell.findMany({
      where: { spreadsheetId: id, rowIndex },
      select: cellSelect,
    });
    return buildRow(rowIndex, columns, cells);
  }

  /**
   * A row's raw records for an in-process consumer (an AI run's input): the
   * sheet's columns in display order plus the row's stored cells. Two indexed
   * reads — `(spreadsheetId, sortOrder)` and `(spreadsheetId, rowIndex)` — in
   * parallel; `buildRowCells` (spreadsheet.shape.ts) turns them into one
   * entry per column. Callers resolve the sheet first: an unknown sheet has
   * no columns rather than an error here.
   */
  async rowCells(
    id: string,
    rowIndex: number,
  ): Promise<{ columns: ColumnRecord[]; cells: CellRecord[] }> {
    const [columns, cells] = await Promise.all([
      this.columnsOf(id),
      prisma.cell.findMany({
        where: { spreadsheetId: id, rowIndex },
        select: cellSelect,
      }),
    ]);
    return { columns, cells };
  }

  async column(id: string, columnIndex: number): Promise<SheetColumn> {
    return toSheetColumn(await this.columnOrThrow(id, columnIndex));
  }

  /** A cell that was never written comes back as `value: null`. */
  async cell(
    id: string,
    rowIndex: number,
    columnIndex: number,
  ): Promise<SheetCell> {
    await this.columnOrThrow(id, columnIndex);
    const record = await prisma.cell.findUnique({
      where: { id: cellId(id, rowIndex, columnIndex) },
      select: { value: true },
    });
    return toSheetCell(
      rowIndex,
      columnIndex,
      (record?.value ?? null) as CellValue,
    );
  }

  /** Shared with the cells service: resolve a column by its scoped pk. */
  async columnOrThrow(
    sheetId: string,
    columnIndex: number,
  ): Promise<ColumnRecord> {
    const record = await prisma.column.findUnique({
      where: { id: columnId(sheetId, columnIndex) },
      select: columnSelect,
    });
    if (!record) {
      await this.byId(sheetId); // distinguishes a missing sheet (404 on the sheet)
      throw new SpreadsheetColumnNotFoundError(columnIndex);
    }
    return record;
  }

  /**
   * The one place the sheet's column order is decided. `sortOrder` is position;
   * `index` only breaks a tie deterministically, and a dense range never has
   * one.
   */
  async columnsOf(sheetId: string): Promise<ColumnRecord[]> {
    return prisma.column.findMany({
      where: { spreadsheetId: sheetId },
      orderBy: [{ sortOrder: "asc" }, { index: "asc" }],
      select: columnSelect,
    });
  }
}

export const spreadsheetService = new SpreadsheetService();
