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
// as trpc/routers/spreadsheet.ts. Path params arrive as strings and the
// schemas coerce them; domain and Zod errors become HTTP statuses through the
// global DomainErrorFilter (common/domain-error.filter.ts).

type Params = Record<string, string>;

/** Body plus route params as one object for `schema.parse`; the path wins. */
const withParams = (params: Params, body: unknown = {}) => ({
  ...(body as object),
  ...params,
});

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

  /** 200, not 201: an import replaces a grid and creates no new resource. */
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
  rows(@Param() params: Params, @Query() query: Record<string, unknown>) {
    return spreadsheetService.rows(
      sheetRowsInput.parse(withParams(params, query)),
    );
  }

  @Post(":id/rows")
  createRow(@Param() params: Params, @Body() body: unknown) {
    return spreadsheetCellsService.createRow(
      createRowInput.parse(withParams(params, body)),
    );
  }

  @Post(":id/rows/append")
  appendRow(@Param() params: Params, @Body() body: unknown) {
    return spreadsheetCellsService.appendRow(
      appendRowInput.parse(withParams(params, body)),
    );
  }

  /** 200, not 201: a batch delete creates nothing. */
  @Post(":id/rows/remove")
  @HttpCode(200)
  removeRows(@Param() params: Params, @Body() body: unknown) {
    return spreadsheetCellsService.removeRows(
      removeRowsInput.parse(withParams(params, body)),
    );
  }

  @Get(":id/rows/:rowIndex")
  row(@Param() params: Params) {
    const { id, rowIndex } = rowRefInput.parse(params);
    return spreadsheetService.row(id, rowIndex);
  }

  @Patch(":id/rows/:rowIndex")
  updateRow(@Param() params: Params, @Body() body: unknown) {
    return spreadsheetCellsService.updateRow(
      updateRowInput.parse(withParams(params, body)),
    );
  }

  @Delete(":id/rows/:rowIndex")
  removeRow(@Param() params: Params) {
    const { id, rowIndex } = rowRefInput.parse(params);
    return spreadsheetCellsService.removeRow(id, rowIndex);
  }

  @Post(":id/columns")
  createColumn(@Param() params: Params, @Body() body: unknown) {
    return spreadsheetColumnsService.createColumn(
      createColumnInput.parse(withParams(params, body)),
    );
  }

  @Get(":id/columns/:columnIndex")
  column(@Param() params: Params) {
    const { id, columnIndex } = columnRefInput.parse(params);
    return spreadsheetService.column(id, columnIndex);
  }

  @Patch(":id/columns/:columnIndex")
  updateColumn(@Param() params: Params, @Body() body: unknown) {
    return spreadsheetColumnsService.updateColumn(
      updateColumnInput.parse(withParams(params, body)),
    );
  }

  /**
   * POST, not PATCH: a reorder writes several rows rather than patching one —
   * the same reason `POST :id/rows/remove` is a POST. The extra path segment
   * keeps it clear of `:id/columns/:columnIndex`.
   */
  @Post(":id/columns/:columnIndex/reorder")
  @HttpCode(200)
  reorderColumn(@Param() params: Params, @Body() body: unknown) {
    return spreadsheetColumnsService.reorderColumn(
      reorderColumnInput.parse(withParams(params, body)),
    );
  }

  @Delete(":id/columns/:columnIndex")
  removeColumn(@Param() params: Params) {
    const { id, columnIndex } = columnRefInput.parse(params);
    return spreadsheetColumnsService.removeColumn(id, columnIndex);
  }

  @Get(":id/cells/:rowIndex/:columnIndex")
  cell(@Param() params: Params) {
    const { id, rowIndex, columnIndex } = cellRefInput.parse(params);
    return spreadsheetService.cell(id, rowIndex, columnIndex);
  }

  @Patch(":id/cells/:rowIndex/:columnIndex")
  setCell(@Param() params: Params, @Body() body: unknown) {
    return spreadsheetCellsService.setCell(
      setCellInput.parse(withParams(params, body)),
    );
  }
}
