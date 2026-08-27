import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  cellRefInput,
  columnRefInput,
  createColumnInput,
  createRowInput,
  createSpreadsheetInput,
  rowRefInput,
  setCellInput,
  sheetRowsInput,
  updateColumnInput,
  updateRowInput,
} from "./spreadsheet.schema";
import { spreadsheetService } from "./spreadsheet.service";
import { spreadsheetCellsService } from "./spreadsheet-cells.service";

// The REST face of the spreadsheet feature — same services, same zod inputs
// as trpc/routers/spreadsheet.ts. Path/query params arrive as strings; the
// schemas coerce them. Domain and Zod errors are mapped to HTTP statuses by
// the global DomainErrorFilter (common/domain-error.filter.ts).

@Controller("spreadsheets")
export class SpreadsheetController {
  @Get()
  list() {
    return spreadsheetService.list();
  }

  @Post()
  create(@Body() body: unknown) {
    return spreadsheetService.create(createSpreadsheetInput.parse(body));
  }

  @Get(":id")
  byId(@Param("id") id: string) {
    return spreadsheetService.byId(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return spreadsheetService.remove(id);
  }

  @Get(":id/rows")
  rows(@Param("id") id: string, @Query() query: Record<string, unknown>) {
    return spreadsheetService.rows(sheetRowsInput.parse({ id, ...query }));
  }

  @Post(":id/rows")
  createRow(@Param("id") id: string, @Body() body: unknown) {
    const input = createRowInput.parse({ ...(body as object), id });
    return spreadsheetCellsService.createRow(input);
  }

  @Get(":id/rows/:rowIndex")
  row(@Param("id") id: string, @Param("rowIndex") rowIndex: string) {
    const input = rowRefInput.parse({ id, rowIndex });
    return spreadsheetService.row(input.id, input.rowIndex);
  }

  @Patch(":id/rows/:rowIndex")
  updateRow(
    @Param("id") id: string,
    @Param("rowIndex") rowIndex: string,
    @Body() body: unknown,
  ) {
    const input = updateRowInput.parse({ ...(body as object), id, rowIndex });
    return spreadsheetCellsService.updateRow(input);
  }

  @Delete(":id/rows/:rowIndex")
  removeRow(@Param("id") id: string, @Param("rowIndex") rowIndex: string) {
    const input = rowRefInput.parse({ id, rowIndex });
    return spreadsheetCellsService.removeRow(input.id, input.rowIndex);
  }

  @Post(":id/columns")
  createColumn(@Param("id") id: string, @Body() body: unknown) {
    const input = createColumnInput.parse({ ...(body as object), id });
    return spreadsheetCellsService.createColumn(input);
  }

  @Get(":id/columns/:columnIndex")
  column(@Param("id") id: string, @Param("columnIndex") columnIndex: string) {
    const input = columnRefInput.parse({ id, columnIndex });
    return spreadsheetService.column(input.id, input.columnIndex);
  }

  @Patch(":id/columns/:columnIndex")
  updateColumn(
    @Param("id") id: string,
    @Param("columnIndex") columnIndex: string,
    @Body() body: unknown,
  ) {
    const input = updateColumnInput.parse({
      ...(body as object),
      id,
      columnIndex,
    });
    return spreadsheetCellsService.updateColumn(input);
  }

  @Delete(":id/columns/:columnIndex")
  removeColumn(
    @Param("id") id: string,
    @Param("columnIndex") columnIndex: string,
  ) {
    const input = columnRefInput.parse({ id, columnIndex });
    return spreadsheetCellsService.removeColumn(input.id, input.columnIndex);
  }

  @Get(":id/cells/:rowIndex/:columnIndex")
  cell(
    @Param("id") id: string,
    @Param("rowIndex") rowIndex: string,
    @Param("columnIndex") columnIndex: string,
  ) {
    const input = cellRefInput.parse({ id, rowIndex, columnIndex });
    return spreadsheetService.cell(input.id, input.rowIndex, input.columnIndex);
  }

  @Patch(":id/cells/:rowIndex/:columnIndex")
  setCell(
    @Param("id") id: string,
    @Param("rowIndex") rowIndex: string,
    @Param("columnIndex") columnIndex: string,
    @Body() body: unknown,
  ) {
    const input = setCellInput.parse({
      ...(body as object),
      id,
      rowIndex,
      columnIndex,
    });
    return spreadsheetCellsService.setCell(input);
  }
}
