import { idInput } from "../../common/schema";
import {
  appendRowInput,
  cellRefInput,
  columnRefInput,
  createColumnInput,
  createRowInput,
  createSpreadsheetInput,
  removeRowsInput,
  reorderColumnInput,
  rowRefInput,
  setCellInput,
  sheetRowsInput,
  updateCellsInput,
  updateColumnInput,
  updateRowInput,
} from "../../modules/spreadsheet/spreadsheet.schema";
import { spreadsheetService } from "../../modules/spreadsheet/spreadsheet.service";
import { spreadsheetCellsService } from "../../modules/spreadsheet/spreadsheet-cells.service";
import { spreadsheetColumnsService } from "../../modules/spreadsheet/spreadsheet-columns.service";
import { createTRPCRouter, mapDomainError, protectedProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the services.
// Nothing here may import @nestjs/* (AGENTS.md invariant 2). The REST twin of
// this surface is modules/spreadsheet/spreadsheet.controller.ts.

export const spreadsheetRouter = createTRPCRouter({
  list: protectedProcedure.query(() => spreadsheetService.list()),

  byId: protectedProcedure
    .input(idInput)
    .query(({ input }) =>
      spreadsheetService.byId(input.id).catch(mapDomainError),
    ),

  create: protectedProcedure
    .input(createSpreadsheetInput)
    .mutation(({ input }) =>
      spreadsheetService.create(input).catch(mapDomainError),
    ),

  remove: protectedProcedure
    .input(idInput)
    .mutation(({ input }) =>
      spreadsheetService.remove(input.id).catch(mapDomainError),
    ),

  rows: protectedProcedure
    .input(sheetRowsInput)
    .query(({ input }) => spreadsheetService.rows(input).catch(mapDomainError)),

  row: protectedProcedure
    .input(rowRefInput)
    .query(({ input }) =>
      spreadsheetService.row(input.id, input.rowIndex).catch(mapDomainError),
    ),

  column: protectedProcedure
    .input(columnRefInput)
    .query(({ input }) =>
      spreadsheetService
        .column(input.id, input.columnIndex)
        .catch(mapDomainError),
    ),

  cell: protectedProcedure
    .input(cellRefInput)
    .query(({ input }) =>
      spreadsheetService
        .cell(input.id, input.rowIndex, input.columnIndex)
        .catch(mapDomainError),
    ),

  setCell: protectedProcedure
    .input(setCellInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.setCell(input).catch(mapDomainError),
    ),

  updateCells: protectedProcedure
    .input(updateCellsInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.updateCells(input).catch(mapDomainError),
    ),

  updateRow: protectedProcedure
    .input(updateRowInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.updateRow(input).catch(mapDomainError),
    ),

  createRow: protectedProcedure
    .input(createRowInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.createRow(input).catch(mapDomainError),
    ),

  appendRow: protectedProcedure
    .input(appendRowInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.appendRow(input).catch(mapDomainError),
    ),

  removeRow: protectedProcedure
    .input(rowRefInput)
    .mutation(({ input }) =>
      spreadsheetCellsService
        .removeRow(input.id, input.rowIndex)
        .catch(mapDomainError),
    ),

  removeRows: protectedProcedure
    .input(removeRowsInput)
    .mutation(({ input }) =>
      spreadsheetCellsService.removeRows(input).catch(mapDomainError),
    ),

  createColumn: protectedProcedure
    .input(createColumnInput)
    .mutation(({ input }) =>
      spreadsheetColumnsService.createColumn(input).catch(mapDomainError),
    ),

  updateColumn: protectedProcedure
    .input(updateColumnInput)
    .mutation(({ input }) =>
      spreadsheetColumnsService.updateColumn(input).catch(mapDomainError),
    ),

  reorderColumn: protectedProcedure
    .input(reorderColumnInput)
    .mutation(({ input }) =>
      spreadsheetColumnsService.reorderColumn(input).catch(mapDomainError),
    ),

  removeColumn: protectedProcedure
    .input(columnRefInput)
    .mutation(({ input }) =>
      spreadsheetColumnsService
        .removeColumn(input.id, input.columnIndex)
        .catch(mapDomainError),
    ),
});
