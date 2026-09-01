import { prisma } from "../../db/prisma";
import {
  SpreadsheetPromptWithoutNodeError,
  SpreadsheetSortOrderOutOfRangeError,
} from "./spreadsheet.errors";
import { columnId, shortColumnId } from "./spreadsheet.ids";
import type {
  CreateColumnInput,
  ReorderColumnInput,
  SheetColumn,
  UpdateColumnInput,
} from "./spreadsheet.schema";
import { toDbColumnType, toDbNodeType } from "./spreadsheet.schema";
import { columnSelect, spreadsheetService } from "./spreadsheet.service";
import { toSheetColumn } from "./spreadsheet.shape";

// Framework-free (see spreadsheet.service.ts). Every write to the Column table
// lives here; the split off spreadsheet-cells.service.ts keeps both inside the
// size cap (docs/rules/COMMON.md §5) and puts the multi-row reorder next to the
// two operations whose job is to keep its arithmetic valid.
//
// A column carries two numbers and confusing them is the expensive mistake:
//
// - `index` is IDENTITY. It is the pk suffix ("<sheetId>.col.<index>"), the
//   wire id ("col.<index>") and the address of every cell (Cell.columnIndex).
//   It is append-only and its gaps are permanent. It never changes.
// - `sortOrder` is POSITION, dense 0..n-1 per sheet. Create appends at the end,
//   remove closes the gap it leaves, reorder shifts a band by one. Nothing else
//   writes it, and the density it maintains is what makes the shift correct.

export class SpreadsheetColumnsService {
  /**
   * Append-only: the new column lands one past the highest stored index, and
   * one past the highest sort order. Its index is not the count — `remove`
   * leaves permanent gaps, and reusing a deleted index would resurrect its old
   * identity — but its sort order is, because that range stays dense.
   */
  async createColumn({
    id,
    name,
    type,
    node,
    prompt,
  }: CreateColumnInput): Promise<SheetColumn> {
    await spreadsheetService.byId(id);
    const max = await prisma.column.aggregate({
      where: { spreadsheetId: id },
      _max: { index: true, sortOrder: true },
    });
    const index = (max._max.index ?? -1) + 1;
    const record = await prisma.column.create({
      data: {
        id: columnId(id, index),
        spreadsheetId: id,
        index,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
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
   *
   * Position is deliberately not updatable here: moving a column is a
   * multi-row write, so it is `reorderColumn` and not a partial field update.
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
   * Moves a column to a new display position. Only `sortOrder` changes — no
   * id, no index, no `Cell.columnIndex`, so every cell stays with its column
   * and every in-flight write stays correctly addressed.
   *
   * Moving left shifts the band [to, from) right by one; moving right shifts
   * (from, to] left by one. Both are a single `updateMany`, never a per-column
   * loop, and both preserve density — which is what keeps the arithmetic valid
   * for the next reorder.
   */
  async reorderColumn({
    id,
    columnIndex,
    newSortOrder,
  }: ReorderColumnInput): Promise<SheetColumn[]> {
    // Resolves the sheet-missing vs column-missing distinction for free.
    const stored = await spreadsheetService.columnOrThrow(id, columnIndex);
    const count = await prisma.column.count({ where: { spreadsheetId: id } });
    if (newSortOrder > count - 1) {
      throw new SpreadsheetSortOrderOutOfRangeError(newSortOrder, count - 1);
    }
    const from = stored.sortOrder;
    if (from !== newSortOrder) {
      const left = from > newSortOrder;
      await prisma.$transaction([
        prisma.column.updateMany({
          where: {
            spreadsheetId: id,
            sortOrder: left
              ? { gte: newSortOrder, lt: from }
              : { gt: from, lte: newSortOrder },
          },
          data: { sortOrder: { increment: left ? 1 : -1 } },
        }),
        prisma.column.update({
          where: { id: columnId(id, columnIndex) },
          data: { sortOrder: newSortOrder },
        }),
      ]);
    }
    // A same-position reorder still answers with the order, so the client
    // always has something to apply.
    return (await spreadsheetService.columnsOf(id)).map(toSheetColumn);
  }

  /**
   * Drops the column and its cells in one transaction. Its `index` becomes a
   * permanent gap — index-derived ids never renumber — but its `sortOrder`
   * does not: the columns to its right close up, so the range stays dense.
   * Deleting an index that holds no column is NOT_FOUND, matching
   * `updateColumn`.
   */
  async removeColumn(id: string, columnIndex: number): Promise<{ id: string }> {
    const stored = await spreadsheetService.columnOrThrow(id, columnIndex);
    await prisma.$transaction([
      prisma.cell.deleteMany({ where: { spreadsheetId: id, columnIndex } }),
      prisma.column.delete({ where: { id: columnId(id, columnIndex) } }),
      prisma.column.updateMany({
        where: { spreadsheetId: id, sortOrder: { gt: stored.sortOrder } },
        data: { sortOrder: { decrement: 1 } },
      }),
    ]);
    return { id: shortColumnId(columnIndex) };
  }
}

export const spreadsheetColumnsService = new SpreadsheetColumnsService();
