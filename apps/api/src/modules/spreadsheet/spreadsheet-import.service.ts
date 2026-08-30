import type { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../db/prisma";
import {
  SpreadsheetImportTooLargeError,
  SpreadsheetImportUnsupportedTypeError,
} from "./spreadsheet.errors";
import { cellId, columnId, rowId, shortColumnId } from "./spreadsheet.ids";
import type { SheetImportResult } from "./spreadsheet.schema";
import {
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  toDbColumnType,
} from "./spreadsheet.schema";
import { spreadsheetService } from "./spreadsheet.service";
import type { InferredSheet } from "./spreadsheet-import.infer";
import { inferSheet } from "./spreadsheet-import.infer";
import { detectFormat, readTable } from "./spreadsheet-import.parse";

// Framework-free (see spreadsheet.service.ts). Its own service rather than a
// method on SpreadsheetCellsService: that file is already at the size cap, and
// this is the one grid write that is neither per-cell, per-row nor per-column.

/** Postgres caps a statement at 65535 bind parameters; a Cell costs ~6. */
const CREATE_CHUNK = 2_000;

function chunk<T>(items: T[]): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / CREATE_CHUNK) },
    (_, index) => items.slice(index * CREATE_CHUNK, (index + 1) * CREATE_CHUNK),
  );
}

/**
 * Every record of the new grid, with its primary key. The scoped ids are pure
 * functions of `(sheetId, index)`, so `createMany` needs no lookups and no
 * upserts — the whole rebuild is one write pass.
 */
function buildRecords(id: string, plan: InferredSheet) {
  const columnData = plan.columns.map((column, index) => ({
    id: columnId(id, index),
    spreadsheetId: id,
    index,
    name: column.name,
    type: toDbColumnType(column.type),
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
        value: value as Prisma.InputJsonValue,
      });
    }
  }

  return { columnData, rowData, cellData };
}

export class SpreadsheetImportService {
  /** Parses an uploaded CSV/XLSX and replaces the sheet's grid with it. */
  async import(
    id: string,
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<SheetImportResult> {
    const meta = await spreadsheetService.byId(id);
    const format = detectFormat(filename, mimeType);
    if (!format) throw new SpreadsheetImportUnsupportedTypeError(filename);

    const plan = inferSheet(await readTable(bytes, format));
    if (plan.columns.length > MAX_IMPORT_COLUMNS) {
      throw new SpreadsheetImportTooLargeError(
        "columns",
        plan.columns.length,
        MAX_IMPORT_COLUMNS,
      );
    }
    if (plan.cells.length > MAX_IMPORT_ROWS) {
      throw new SpreadsheetImportTooLargeError(
        "rows",
        plan.cells.length,
        MAX_IMPORT_ROWS,
      );
    }

    const { rowCount, cellCount } = await this.replaceAll(id, plan);
    return {
      id: meta.id,
      name: meta.name,
      // The sheet's virtual height is not a row count and an import does not
      // change it; `rowCount` is what the file held.
      totalRows: meta.totalRows,
      totalColumns: plan.columns.length,
      rowCount,
      cellCount,
      columns: plan.columns.map((column, index) => ({
        id: shortColumnId(index),
        index,
        name: column.name,
        type: column.type,
        node: null,
        prompt: null,
      })),
    };
  }

  /**
   * The only way to wipe a sheet's grid. `removeColumn` permits deleting the
   * LAST column only, so a wipe cannot loop it. Delete and rebuild happen in
   * one transaction, so a failed import leaves the sheet exactly as it was.
   */
  async replaceAll(
    id: string,
    plan: InferredSheet,
  ): Promise<{ rowCount: number; cellCount: number }> {
    const { columnData, rowData, cellData } = buildRecords(id, plan);
    // The array form runs every operation sequentially inside one transaction,
    // so chunking for the bind-parameter limit does not weaken atomicity.
    await prisma.$transaction([
      prisma.cell.deleteMany({ where: { spreadsheetId: id } }),
      prisma.row.deleteMany({ where: { spreadsheetId: id } }),
      prisma.column.deleteMany({ where: { spreadsheetId: id } }),
      ...chunk(columnData).map((data) => prisma.column.createMany({ data })),
      ...chunk(rowData).map((data) => prisma.row.createMany({ data })),
      ...chunk(cellData).map((data) => prisma.cell.createMany({ data })),
    ]);
    return { rowCount: rowData.length, cellCount: cellData.length };
  }
}

export const spreadsheetImportService = new SpreadsheetImportService();
