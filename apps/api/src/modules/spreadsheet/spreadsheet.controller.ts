import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
} from "@nestjs/common";
import type { MulterFile } from "../../common/multipart";
import { requireFile, UploadFile } from "../../common/upload";
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
  updateColumnInput,
  updateRowInput,
} from "./spreadsheet.schema";
import { spreadsheetService } from "./spreadsheet.service";
import { spreadsheetCellsService } from "./spreadsheet-cells.service";
import { spreadsheetColumnsService } from "./spreadsheet-columns.service";
import { spreadsheetImportService } from "./spreadsheet-import.service";

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

  /**
   * 200, not the @Post default of 201: an import replaces a sheet's grid and
   * creates no new resource at a new URL.
   */
  @Post(":id/import")
  @HttpCode(200)
  @UploadFile()
  importFile(@Param("id") id: string, @UploadedFile() file?: MulterFile) {
    const upload = requireFile(file);
    return spreadsheetImportService.import(
      id,
      upload.buffer,
      upload.originalname,
      upload.mimetype,
    );
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

  @Post(":id/rows/append")
  appendRow(@Param("id") id: string, @Body() body: unknown) {
    const input = appendRowInput.parse({ ...(body as object), id });
    return spreadsheetCellsService.appendRow(input);
  }

  /** 200, not 201: a batch delete creates nothing. */
  @Post(":id/rows/remove")
  @HttpCode(200)
  removeRows(@Param("id") id: string, @Body() body: unknown) {
    const input = removeRowsInput.parse({ ...(body as object), id });
    return spreadsheetCellsService.removeRows(input);
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
    return spreadsheetColumnsService.createColumn(input);
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
    return spreadsheetColumnsService.updateColumn(input);
  }

  /**
   * Moves a column. POST, not PATCH: it writes several rows rather than
   * patching fields on one — the same reason `POST :id/rows/remove` is a POST.
   * More path segments than `:id/columns/:columnIndex`, so no route shadowing.
   */
  @Post(":id/columns/:columnIndex/reorder")
  @HttpCode(200)
  reorderColumn(
    @Param("id") id: string,
    @Param("columnIndex") columnIndex: string,
    @Body() body: unknown,
  ) {
    const input = reorderColumnInput.parse({
      ...(body as object),
      id,
      columnIndex,
    });
    return spreadsheetColumnsService.reorderColumn(input);
  }

  @Delete(":id/columns/:columnIndex")
  removeColumn(
    @Param("id") id: string,
    @Param("columnIndex") columnIndex: string,
  ) {
    const input = columnRefInput.parse({ id, columnIndex });
    return spreadsheetColumnsService.removeColumn(input.id, input.columnIndex);
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
