import { DomainError, describeError } from "../../common/errors";
import { runAiBatchService } from "../run-ai/run-ai-batch.service";
import type { CellValue } from "../spreadsheet/spreadsheet.schema";
import { toWireColumnType } from "../spreadsheet/spreadsheet.schema";
import { spreadsheetService } from "../spreadsheet/spreadsheet.service";
import type { ColumnRecord } from "../spreadsheet/spreadsheet.shape";
import { spreadsheetCellsService } from "../spreadsheet/spreadsheet-cells.service";
import {
  PopulateFieldNotFillableError,
  PopulateUnknownFieldError,
} from "./populate.errors";
import type {
  PopulateForm,
  PopulateSubmission,
  PopulateSubmitInput,
} from "./populate.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). Populate owns no table:
// it resolves column names, then delegates the write to the spreadsheet
// feature and the runs to run-ai. Nothing here touches prisma.

/** A column a person fills: formulas and node (AI) columns are computed. */
const isFillable = (column: ColumnRecord) =>
  column.node === null && toWireColumnType(column.type) !== "formula";

/**
 * Column names are not unique. The first fillable column in display order
 * owns its name; a later duplicate cannot be addressed and is left out.
 */
function fillableByName(columns: ColumnRecord[]): Map<string, ColumnRecord> {
  const byName = new Map<string, ColumnRecord>();
  for (const column of columns) {
    if (isFillable(column) && !byName.has(column.name)) {
      byName.set(column.name, column);
    }
  }
  return byName;
}

/** Names → cell writes. Every offending name is collected before throwing. */
function resolveCells(
  columns: ColumnRecord[],
  fields: Record<string, CellValue>,
): { columnIndex: number; value: CellValue }[] {
  const fillable = fillableByName(columns);
  const allNames = new Set(columns.map((column) => column.name));
  const names = Object.keys(fields);
  const unknown = names.filter((name) => !allNames.has(name));
  if (unknown.length > 0) throw new PopulateUnknownFieldError(unknown);
  const computed = names.filter((name) => !fillable.has(name));
  if (computed.length > 0) throw new PopulateFieldNotFillableError(computed);
  return names.map((name) => ({
    columnIndex: (fillable.get(name) as ColumnRecord).index,
    value: fields[name] as CellValue,
  }));
}

export class PopulateService {
  async form(id: string): Promise<PopulateForm> {
    const sheet = await spreadsheetService.byId(id);
    const columns = await spreadsheetService.columnsOf(id);
    return {
      spreadsheet: { id: sheet.id, name: sheet.name },
      fields: [...fillableByName(columns).values()].map((column) => ({
        name: column.name,
        type: toWireColumnType(column.type),
        columnIndex: column.index,
      })),
    };
  }

  /** Appends the row, then starts the row's AI columns. */
  async submit({
    id,
    fields,
  }: PopulateSubmitInput): Promise<PopulateSubmission> {
    await spreadsheetService.byId(id);
    const cells = resolveCells(await spreadsheetService.columnsOf(id), fields);
    const row = await spreadsheetCellsService.appendRow({ id, cells });
    return { row, ...(await this.triggerRuns(id, row.index)) };
  }

  /**
   * The row is already saved, so nothing thrown here may fail the submission:
   * a caller that retried would append the row twice. The reason is reported
   * instead.
   */
  private async triggerRuns(
    id: string,
    rowIndex: number,
  ): Promise<Pick<PopulateSubmission, "runs" | "runError">> {
    try {
      return {
        runs: await runAiBatchService.runRow(id, rowIndex),
        runError: null,
      };
    } catch (error) {
      return {
        runs: [],
        runError: {
          code: error instanceof DomainError ? error.code : "INTERNAL_ERROR",
          message: describeError(error).message,
        },
      };
    }
  }
}

export const populateService = new PopulateService();
