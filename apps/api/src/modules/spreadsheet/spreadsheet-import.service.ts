import { isUniqueViolation } from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import {
  SpreadsheetImportTooLargeError,
  SpreadsheetImportUnsupportedTypeError,
} from "./spreadsheet.errors";
import { shortColumnId } from "./spreadsheet.ids";
import type {
  SheetColumn,
  SheetImportPreview,
  SheetImportResult,
} from "./spreadsheet.schema";
import {
  IMPORT_PREVIEW_ROWS,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  toWireColumnType,
} from "./spreadsheet.schema";
import { spreadsheetService } from "./spreadsheet.service";
import { toSheetColumn } from "./spreadsheet.shape";
import { nextRowIndex } from "./spreadsheet-cells.service";
import type { InferredSheet } from "./spreadsheet-import.infer";
import { inferSheet } from "./spreadsheet-import.infer";
import { unionTables } from "./spreadsheet-import.match";
import type { ImportFormat } from "./spreadsheet-import.parse";
import { detectFormat, readTables } from "./spreadsheet-import.parse";
import type { MergePlan } from "./spreadsheet-import.plan";
import { planMerge } from "./spreadsheet-import.plan";
import {
  buildMergeRecords,
  buildRecords,
  chunk,
} from "./spreadsheet-import.records";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The grid writes that are
// neither per-cell, per-row nor per-column: parse an upload, then merge it
// into the sheet (import) or replace the whole grid with it (onboarding).

type ParsedUpload = {
  format: ImportFormat;
  tableCount: number;
  sheet: InferredSheet;
};

/** A concurrent append can take the row indexes an import planned to use. */
const MERGE_ATTEMPTS = 3;

export class SpreadsheetImportService {
  /**
   * Parses an uploaded CSV/XLSX/DOCX and merges it into the sheet: matching
   * columns are filled, the rest are added, and the file's rows are appended
   * below the existing ones. Nothing already in the sheet changes.
   */
  async import(
    id: string,
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<SheetImportResult> {
    const meta = await spreadsheetService.byId(id);
    const { sheet } = await this.read(bytes, filename, mimeType);
    const { plan, cellCount } = await this.merge(id, sheet);
    const columns = (await spreadsheetService.columnsOf(id)).map(toSheetColumn);
    const created = plan.columns.filter((c) => c.target.kind === "new").length;
    return {
      id: meta.id,
      name: meta.name,
      // The sheet's virtual height is not a row count and an import does not
      // change it; `rowCount` is what the file held.
      totalRows: meta.totalRows,
      totalColumns: columns.length,
      rowCount: plan.rowCount,
      cellCount,
      columnsMatched: plan.columns.length - created,
      columnsCreated: created,
      columns,
    };
  }

  /** What `import` would do with this file, without writing anything. */
  async preview(
    id: string,
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<SheetImportPreview> {
    await spreadsheetService.byId(id);
    const upload = await this.read(bytes, filename, mimeType);
    const { plan } = await this.plan(id, upload.sheet);
    return {
      format: upload.format,
      tableCount: upload.tableCount,
      rowCount: plan.rowCount,
      columns: plan.columns.map(({ source, target, skippedValues }) => ({
        source,
        skippedValues,
        target:
          target.kind === "new"
            ? target
            : {
                kind: "existing" as const,
                id: shortColumnId(target.record.index),
                name: target.record.name,
                type: toWireColumnType(target.record.type),
              },
      })),
      sampleRows: Array.from(
        { length: Math.min(plan.rowCount, IMPORT_PREVIEW_ROWS) },
        (_, row) => plan.columns.map((column) => column.values[row] ?? null),
      ),
    };
  }

  /**
   * Reads and types an upload without touching the database, so a caller can
   * reject a bad file before writing anything (onboarding creates its
   * workspace only after this passes).
   */
  async parse(
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<InferredSheet> {
    return (await this.read(bytes, filename, mimeType)).sheet;
  }

  private async read(
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<ParsedUpload> {
    const format = detectFormat(filename, mimeType);
    if (!format) throw new SpreadsheetImportUnsupportedTypeError(filename);

    // A Word document's tables become one grid; a CSV or workbook is one.
    const tables = await readTables(bytes, format);
    const sheet = inferSheet(
      format === "docx" ? unionTables(tables) : (tables[0] ?? []),
    );
    if (sheet.columns.length > MAX_IMPORT_COLUMNS) {
      throw new SpreadsheetImportTooLargeError(
        "columns",
        sheet.columns.length,
        MAX_IMPORT_COLUMNS,
      );
    }
    if (sheet.cells.length > MAX_IMPORT_ROWS) {
      throw new SpreadsheetImportTooLargeError(
        "rows",
        sheet.cells.length,
        MAX_IMPORT_ROWS,
      );
    }
    return { format, tableCount: tables.length, sheet };
  }

  /** Maps the file onto the sheet's current columns; refuses too many. */
  private async plan(id: string, sheet: InferredSheet) {
    const existing = await spreadsheetService.columnsOf(id);
    const plan = planMerge(existing, sheet);
    const created = plan.columns.filter((c) => c.target.kind === "new").length;
    if (existing.length + created > MAX_IMPORT_COLUMNS) {
      throw new SpreadsheetImportTooLargeError(
        "columns",
        existing.length + created,
        MAX_IMPORT_COLUMNS,
      );
    }
    return { existing, plan };
  }

  /**
   * One transaction, so a failed import leaves the sheet exactly as it was.
   * It is planned against a snapshot of the columns and rows; a concurrent
   * write that takes one of the planned indexes is a unique violation, and
   * the merge is re-planned against the new state.
   */
  private async merge(
    id: string,
    sheet: InferredSheet,
  ): Promise<{ plan: MergePlan; cellCount: number }> {
    for (let attempt = 1; ; attempt += 1) {
      const { existing, plan } = await this.plan(id, sheet);
      const firstRow = await nextRowIndex(id);
      const records = buildMergeRecords(id, existing, plan, firstRow);
      try {
        await prisma.$transaction([
          ...chunk(records.columnData).map((data) =>
            prisma.column.createMany({ data }),
          ),
          ...chunk(records.rowData).map((data) =>
            prisma.row.createMany({ data }),
          ),
          ...chunk(records.cellData).map((data) =>
            prisma.cell.createMany({ data }),
          ),
        ]);
        return { plan, cellCount: records.cellData.length };
      } catch (error) {
        if (attempt >= MERGE_ATTEMPTS || !isUniqueViolation(error)) throw error;
      }
    }
  }

  /**
   * The only full-grid wipe-and-rebuild, used by onboarding to fill a fresh
   * sheet: `removeColumn` drops single columns (leaving index gaps), and an
   * import merges. Delete and rebuild happen in one transaction, so a failure
   * leaves the sheet exactly as it was.
   */
  async replaceAll(
    id: string,
    plan: InferredSheet,
  ): Promise<{ rowCount: number; cellCount: number; columns: SheetColumn[] }> {
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
    return {
      rowCount: rowData.length,
      cellCount: cellData.length,
      columns: columnData.map(toSheetColumn),
    };
  }
}

export const spreadsheetImportService = new SpreadsheetImportService();
