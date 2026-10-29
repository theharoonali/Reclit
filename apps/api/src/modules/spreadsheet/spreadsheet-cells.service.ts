import { isUniqueViolation } from "../../common/prisma-errors";
import { prisma, toJsonInput } from "../../db/prisma";
import {
  SpreadsheetCellTypeMismatchError,
  SpreadsheetColumnNotFoundError,
  SpreadsheetColumnReadOnlyError,
  SpreadsheetRowExistsError,
} from "./spreadsheet.errors";
import { cellId, rowId, shortRowId } from "./spreadsheet.ids";
import type {
  AppendRowInput,
  CellValue,
  CreateRowInput,
  RemoveRowsInput,
  SetCellInput,
  SheetCell,
  SheetRow,
  UpdateCellsInput,
  UpdateRowInput,
} from "./spreadsheet.schema";
import {
  cellValueMatchesType,
  toWireColumnType,
  toWireNodeType,
} from "./spreadsheet.schema";
import { spreadsheetService } from "./spreadsheet.service";
import type { ColumnRecord } from "./spreadsheet.shape";
import { toSheetCell } from "./spreadsheet.shape";

// Framework-free (docs/rules/BACKEND.md hard rule 1). Row and cell writes;
// column writes are spreadsheet-columns.service.ts, the full-grid rebuild
// spreadsheet-import.service.ts. Lookups come from `spreadsheetService`.

type CellWrite = { columnIndex: number; value: CellValue };
type StoredValue = Exclude<CellValue, null>;

/** Throws unless `value` fits the column's declared type. */
function assertValueFits(value: CellValue, dbType: string): void {
  const wireType = toWireColumnType(dbType);
  if (!cellValueMatchesType(value, wireType)) {
    throw new SpreadsheetCellTypeMismatchError(wireType, value);
  }
}

/**
 * Throws for a manual write to a machine-written column: a Mail column's
 * cells hold what its runs sent, and only `runAiService.complete` (through
 * `setCell`'s `computed` option) may write them.
 */
function assertEditable(column: ColumnRecord): void {
  if (column.node !== null && toWireNodeType(column.node) === "email") {
    throw new SpreadsheetColumnReadOnlyError(column.name);
  }
}

/** Throws unless every entry targets an existing, editable column with a fitting value. */
function assertCellsFit(columns: ColumnRecord[], cells: CellWrite[]): void {
  const byIndex = new Map(columns.map((column) => [column.index, column]));
  for (const entry of cells) {
    const column = byIndex.get(entry.columnIndex);
    if (!column) throw new SpreadsheetColumnNotFoundError(entry.columnIndex);
    assertEditable(column);
    assertValueFits(entry.value, column.type);
  }
}

// The write builders below return PrismaPromises (not awaited) so callers can
// batch them in one `$transaction([...])`. The scoped pks make every write a
// single statement with no prior lookup.

const rowData = (id: string, index: number) => ({
  id: rowId(id, index),
  spreadsheetId: id,
  index,
});

const cellData = (
  id: string,
  rowIndex: number,
  columnIndex: number,
  value: StoredValue,
) => ({
  id: cellId(id, rowIndex, columnIndex),
  spreadsheetId: id,
  rowIndex,
  columnIndex,
  value: toJsonInput(value),
});

const upsertRow = (id: string, rowIndex: number) =>
  prisma.row.upsert({
    where: { id: rowId(id, rowIndex) },
    create: rowData(id, rowIndex),
    update: {},
  });

/** Writes or clears one cell — `null` deletes the record. */
const writeCell = (
  id: string,
  rowIndex: number,
  { columnIndex, value }: CellWrite,
) =>
  value === null
    ? prisma.cell.deleteMany({
        where: { id: cellId(id, rowIndex, columnIndex) },
      })
    : prisma.cell.upsert({
        where: { id: cellId(id, rowIndex, columnIndex) },
        create: cellData(id, rowIndex, columnIndex, value),
        update: { value: toJsonInput(value) },
      });

/** One past the highest stored row index. */
export async function nextRowIndex(id: string): Promise<number> {
  const { _max } = await prisma.row.aggregate({
    where: { spreadsheetId: id },
    _max: { index: true },
  });
  return (_max.index ?? -1) + 1;
}

export class SpreadsheetCellsService {
  /**
   * The column read both validates the type and proves the sheet exists.
   * `value: null` clears (deletes) the cell. `computed: true` is the one
   * bypass of the read-only guard — the run worker writing its own result.
   */
  async setCell(
    { id, rowIndex, columnIndex, value }: SetCellInput,
    options?: { computed?: boolean },
  ): Promise<SheetCell> {
    const column = await spreadsheetService.columnOrThrow(id, columnIndex);
    if (!options?.computed) assertEditable(column);
    assertValueFits(value, column.type);
    const write = writeCell(id, rowIndex, { columnIndex, value });
    if (value === null) await write;
    else await prisma.$transaction([upsertRow(id, rowIndex), write]);
    return toSheetCell(rowIndex, columnIndex, value);
  }

  /** Proves the sheet exists and every entry fits one of its columns. */
  private async assertWritable(id: string, cells: CellWrite[]): Promise<void> {
    await spreadsheetService.byId(id);
    assertCellsFit(await spreadsheetService.columnsOf(id), cells);
  }

  /** Batch of cell writes on one row, validated up front, in one transaction. */
  async updateRow({ id, rowIndex, cells }: UpdateRowInput): Promise<SheetRow> {
    await this.assertWritable(id, cells);
    await prisma.$transaction([
      upsertRow(id, rowIndex),
      ...cells.map((cell) => writeCell(id, rowIndex, cell)),
    ]);
    return spreadsheetService.row(id, rowIndex);
  }

  /**
   * Cell writes across many rows — the assistant's bulk fill — validated up
   * front like `updateRow`, then written in chunked transactions so a refused
   * value writes nothing and a long fill never holds one transaction open. A
   * row whose writes are all clears gets no row record, like `setCell`.
   */
  async updateCells({
    id,
    cells,
  }: UpdateCellsInput): Promise<{ count: number }> {
    await this.assertWritable(id, cells);
    const byRow = new Map<number, CellWrite[]>();
    for (const { rowIndex, ...write } of cells) {
      const writes = byRow.get(rowIndex) ?? [];
      writes.push(write);
      byRow.set(rowIndex, writes);
    }
    const statements = [...byRow].flatMap(([rowIndex, writes]) => [
      ...(writes.some((write) => write.value !== null)
        ? [upsertRow(id, rowIndex)]
        : []),
      ...writes.map((write) => writeCell(id, rowIndex, write)),
    ]);
    const CHUNK = 500;
    for (let start = 0; start < statements.length; start += CHUNK) {
      await prisma.$transaction(statements.slice(start, start + CHUNK));
    }
    return { count: cells.length };
  }

  /**
   * Appends a row at one past the highest stored index, writing its cells in
   * the same transaction. The index race with concurrent appends is retried
   * internally; `value: null` entries write no cell (a row is sparse).
   */
  async appendRow({ id, cells }: AppendRowInput): Promise<SheetRow> {
    await this.assertWritable(id, cells);
    const writes = cells.filter(
      (entry): entry is { columnIndex: number; value: StoredValue } =>
        entry.value !== null,
    );
    const MAX_ATTEMPTS = 3;
    let target = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      target = await nextRowIndex(id);
      try {
        await prisma.$transaction([
          prisma.row.create({ data: rowData(id, target) }),
          ...writes.map(({ columnIndex, value }) =>
            prisma.cell.create({
              data: cellData(id, target, columnIndex, value),
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
    const target = index ?? (await nextRowIndex(id));
    try {
      await prisma.row.create({ data: rowData(id, target) });
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

  /** `removeRow` for a batch, in one transaction; duplicates collapse. */
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
}

export const spreadsheetCellsService = new SpreadsheetCellsService();
