import { truncateValue } from "../../ai/assistant-prompt";
import { spreadsheetService } from "../spreadsheet/spreadsheet.service";
import { spreadsheetCellsService } from "../spreadsheet/spreadsheet-cells.service";
import { spreadsheetColumnsService } from "../spreadsheet/spreadsheet-columns.service";
import type { ASSISTANT_SPREADSHEET_TOOLS } from "./assistant.schema";
import { readAllRows } from "./assistant-context";
import {
  coerceToolValue,
  resolveColumn,
  selectRowIndexes,
  summariseColumn,
} from "./assistant-sheet";
import type { ToolContext, ToolResult } from "./assistant-tool-runtime";
import { ToolInputError } from "./assistant-tool-runtime";
import {
  MAX_REMOVE_ROWS,
  type ToolCellScalar,
  type ToolInput,
} from "./assistant-tools";

// The spreadsheet tools, each a thin call into the spreadsheet services with
// the model's column names resolved against the sheet *as it is now* (an
// earlier step may have renamed one). Deletes are prepared here — the count
// the confirmation shows, then the write — and the executor asks the user in
// between.

export type SheetToolName = (typeof ASSISTANT_SPREADSHEET_TOOLS)[number];

/** A cell value as the model reads it: text, cut like the sample rows but longer. */
const READ_VALUE_CHARS = 200;

const columnsOf = (ctx: ToolContext) =>
  spreadsheetService
    .rows({ id: ctx.sheetId, startRow: 0, limit: 1 })
    .then((page) => page.columns);

async function readRows(
  ctx: ToolContext,
  input: ToolInput<"readRows">,
): Promise<ToolResult> {
  const page = await spreadsheetService.rows({
    id: ctx.sheetId,
    startRow: input.startRow,
    limit: input.limit,
  });
  return {
    mutated: false,
    output: {
      rows: page.rows.map((row) => ({
        index: row.index,
        cells: Object.fromEntries(
          row.columns.map((cell) => [
            cell.name,
            truncateValue(cell.value, READ_VALUE_CHARS),
          ]),
        ),
      })),
      hasMore: page.pagination.hasMore,
      nextStartRow: page.rows.at(-1)
        ? (page.rows.at(-1)?.index ?? 0) + 1
        : null,
    },
  };
}

async function getColumnSummary(
  ctx: ToolContext,
  input: ToolInput<"getColumnSummary">,
): Promise<ToolResult> {
  const payload = await readAllRows(ctx.sheetId);
  const column = resolveColumn(payload.columns, input.column);
  return { mutated: false, output: summariseColumn(payload.rows, column) };
}

async function createColumn(
  ctx: ToolContext,
  input: ToolInput<"createColumn">,
): Promise<ToolResult> {
  const column = await spreadsheetColumnsService.createColumn({
    id: ctx.sheetId,
    name: input.name,
    type: input.type,
    node: input.node ?? null,
    prompt: input.prompt ?? null,
  });
  return {
    mutated: true,
    output: {
      column: { name: column.name, type: column.type, index: column.index },
    },
    extra: { name: column.name },
  };
}

async function updateColumn(
  ctx: ToolContext,
  input: ToolInput<"updateColumn">,
): Promise<ToolResult> {
  const column = resolveColumn(await columnsOf(ctx), input.column);
  const updated = await spreadsheetColumnsService.updateColumn({
    id: ctx.sheetId,
    columnIndex: column.index,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.type !== undefined && { type: input.type }),
    ...(input.node !== undefined && { node: input.node }),
    ...(input.prompt !== undefined && { prompt: input.prompt }),
  });
  return {
    mutated: true,
    output: {
      column: { name: updated.name, type: updated.type, node: updated.node },
    },
    extra: { column: column.name },
  };
}

async function reorderColumn(
  ctx: ToolContext,
  input: ToolInput<"reorderColumn">,
): Promise<ToolResult> {
  const column = resolveColumn(await columnsOf(ctx), input.column);
  const order = await spreadsheetColumnsService.reorderColumn({
    id: ctx.sheetId,
    columnIndex: column.index,
    newSortOrder: input.position,
  });
  return {
    mutated: true,
    output: { order: order.map((entry) => entry.name) },
    extra: { column: column.name },
  };
}

async function writeColumnValues(
  ctx: ToolContext,
  columnName: string,
  cells: { rowIndex: number; value: ToolCellScalar }[],
): Promise<ToolResult> {
  const column = resolveColumn(await columnsOf(ctx), columnName);
  ctx.budget.takeCellWrites(cells.length);
  if (cells.length === 0) {
    return {
      mutated: false,
      output: { written: 0 },
      extra: { column: column.name, count: 0 },
    };
  }
  const { count } = await spreadsheetCellsService.updateCells({
    id: ctx.sheetId,
    cells: cells.map(({ rowIndex, value }) => ({
      rowIndex,
      columnIndex: column.index,
      value: coerceToolValue(value, column.type),
    })),
  });
  return {
    mutated: true,
    output: { written: count },
    extra: { column: column.name, count },
  };
}

const setCells = (ctx: ToolContext, input: ToolInput<"setCells">) =>
  writeColumnValues(ctx, input.column, input.cells);

async function fillColumn(
  ctx: ToolContext,
  input: ToolInput<"fillColumn">,
): Promise<ToolResult> {
  const payload = await readAllRows(ctx.sheetId);
  const indexes = input.where
    ? selectRowIndexes(payload, input.where)
    : payload.rows.map((row) => row.index);
  return writeColumnValues(
    ctx,
    input.column,
    indexes.map((rowIndex) => ({ rowIndex, value: input.value })),
  );
}

async function appendRows(
  ctx: ToolContext,
  input: ToolInput<"appendRows">,
): Promise<ToolResult> {
  const columns = await columnsOf(ctx);
  const rows = input.rows.map((row) =>
    row.cells.map((cell) => {
      const column = resolveColumn(columns, cell.column);
      return {
        columnIndex: column.index,
        value: coerceToolValue(cell.value, column.type),
      };
    }),
  );
  const indexes: number[] = [];
  for (const cells of rows) {
    const row = await spreadsheetCellsService.appendRow({
      id: ctx.sheetId,
      cells,
    });
    indexes.push(row.index);
  }
  return {
    mutated: true,
    output: {
      appended: indexes.length,
      firstIndex: indexes[0],
      lastIndex: indexes.at(-1),
    },
    extra: { count: indexes.length },
  };
}

/** A delete, prepared: what the confirmation says, then the write itself. */
export type PreparedDelete = {
  extra: Record<string, unknown>;
  execute: () => Promise<ToolResult>;
};

export async function prepareRemoveColumn(
  ctx: ToolContext,
  input: ToolInput<"removeColumn">,
): Promise<PreparedDelete> {
  const payload = await readAllRows(ctx.sheetId);
  const column = resolveColumn(payload.columns, input.column);
  const count = summariseColumn(payload.rows, column).filled;
  return {
    extra: { column: column.name, count },
    execute: async () => {
      await spreadsheetColumnsService.removeColumn(ctx.sheetId, column.index);
      return { mutated: true, output: { removed: column.name, values: count } };
    },
  };
}

export async function prepareRemoveRows(
  ctx: ToolContext,
  input: ToolInput<"removeRows">,
): Promise<PreparedDelete> {
  const fromRule = input.where
    ? selectRowIndexes(await readAllRows(ctx.sheetId), input.where)
    : [];
  const indexes = [...new Set([...(input.rowIndexes ?? []), ...fromRule])];
  if (indexes.length === 0) {
    throw new ToolInputError(
      "No stored row matches; nothing to delete",
      "NO_MATCH",
    );
  }
  if (indexes.length > MAX_REMOVE_ROWS) {
    throw new ToolInputError(
      `${indexes.length} rows match; at most ${MAX_REMOVE_ROWS} may be deleted in one call`,
      "TOO_MANY_ROWS",
    );
  }
  return {
    extra: { count: indexes.length },
    execute: async () => {
      const { ids } = await spreadsheetCellsService.removeRows({
        id: ctx.sheetId,
        rowIndexes: indexes,
      });
      return { mutated: true, output: { removed: ids.length } };
    },
  };
}

export function runSheetTool(
  ctx: ToolContext,
  tool: Exclude<SheetToolName, "removeColumn" | "removeRows">,
  input: unknown,
): Promise<ToolResult> {
  switch (tool) {
    case "readRows":
      return readRows(ctx, input as ToolInput<"readRows">);
    case "getColumnSummary":
      return getColumnSummary(ctx, input as ToolInput<"getColumnSummary">);
    case "createColumn":
      return createColumn(ctx, input as ToolInput<"createColumn">);
    case "updateColumn":
      return updateColumn(ctx, input as ToolInput<"updateColumn">);
    case "reorderColumn":
      return reorderColumn(ctx, input as ToolInput<"reorderColumn">);
    case "setCells":
      return setCells(ctx, input as ToolInput<"setCells">);
    case "fillColumn":
      return fillColumn(ctx, input as ToolInput<"fillColumn">);
    case "appendRows":
      return appendRows(ctx, input as ToolInput<"appendRows">);
  }
}
