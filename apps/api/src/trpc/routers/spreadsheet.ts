import { idInput } from "../../common/schema";
import {
  appendRowInput,
  cellRefInput,
  columnRefInput,
  createColumnInput,
  createRowInput,
  createSpreadsheetInput,
  removeRowsInput,
  rowRefInput,
  setCellInput,
  sheetRowsInput,
  updateColumnInput,
  updateRowInput,
} from "../../modules/spreadsheet/spreadsheet.schema";
import { spreadsheetService } from "../../modules/spreadsheet/spreadsheet.service";
import { spreadsheetCellsService } from "../../modules/spreadsheet/spreadsheet-cells.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the services.
// Nothing here may import @nestjs/* (AGENTS.md invariant 2). The REST twin of
// this surface is modules/spreadsheet/spreadsheet.controller.ts.

export const spreadsheetRouter = createTRPCRouter({
  list: publicProcedure.query(() => spreadsheetService.list()),

  byId: publicProcedure
    .input(idInput)
    .query(({ input }) =>
      spreadsheetService.byId(input.id).catch(mapDomainError),
    ),

  create: publicProcedure
    .input(createSpreadsheetInput)
    .mutation(({ input }) => spreadsheetService.create(input)),

  remove: publicProcedure
    .input(idInput)
    .mutation(({ input }) =>
      spreadsheetService.remove(input.id).catch(mapDomainError),
    ),

  rows: publicProcedure
    .input(sheetRowsInput)
    .query(({ input }) => spreadsheetService.rows(input).catch(mapDomainError)),

  row: publicProcedure
    .input(rowRefInput)
    .query(({ input }) =>
      spreadsheetService.row(input.id, input.rowIndex).catch(mapDomainError),
    ),

  column: publicProcedure
    .input(columnRefInput)
    .query(({ input }) =>
      spreadsheetService
        .column(input.id, input.columnIndex)
        .catch(mapDomainError),
    ),

  cell: publicProcedure
    .input(cellRefInput)
    .query(({ input }) =>
      spreadsheetService
        .cell(input.id, input.rowIndex, input.columnIndex)
        .catch(mapDomainError),
    ),

  setCell: publicProcedure
    .input(setCellInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.setCell(input).catch(mapDomainError),
    ),

  updateRow: publicProcedure
    .input(updateRowInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.updateRow(input).catch(mapDomainError),
    ),

  createRow: publicProcedure
    .input(createRowInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.createRow(input).catch(mapDomainError),
    ),

  appendRow: publicProcedure
    .input(appendRowInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.appendRow(input).catch(mapDomainError),
    ),

  removeRow: publicProcedure
    .input(rowRefInput)
    .mutation(({ input }) =>
      spreadsheetCellsService
        .removeRow(input.id, input.rowIndex)
        .catch(mapDomainError),
    ),

  removeRows: publicProcedure
    .input(removeRowsInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.removeRows(input).catch(mapDomainError),
    ),

  createColumn: publicProcedure
    .input(createColumnInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.createColumn(input).catch(mapDomainError),
    ),

  updateColumn: publicProcedure
    .input(updateColumnInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.updateColumn(input).catch(mapDomainError),
    ),

  removeColumn: publicProcedure
    .input(columnRefInput)
    .mutation(({ input }) =>
      spreadsheetCellsService
        .removeColumn(input.id, input.columnIndex)
        .catch(mapDomainError),
    ),
});
