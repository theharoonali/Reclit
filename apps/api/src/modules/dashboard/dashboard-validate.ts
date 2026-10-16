import {
  type ColumnMeta,
  checkLayout,
  validateWidget,
} from "@reclit/dashboard-engine";
import type { Prisma } from "../../../generated/prisma/client";
import { prisma, toJsonInput } from "../../db/prisma";
import { SpreadsheetNotFoundError } from "../spreadsheet/spreadsheet.errors";
import { toWireColumnType } from "../spreadsheet/spreadsheet.schema";
import { spreadsheetService } from "../spreadsheet/spreadsheet.service";
import { workspaceService } from "../workspace/workspace.service";
import {
  DashboardFormulaInvalidError,
  DashboardLayoutInvalidError,
  DashboardQueryInvalidError,
  DashboardSpreadsheetMismatchError,
  DashboardUnknownColumnError,
} from "./dashboard.errors";
import {
  toDbWidgetHeight,
  toDbWidgetType,
  toWidgetQuery,
  type WidgetHeightDb,
  type WidgetInput,
  type WidgetTypeDb,
} from "./dashboard.schema";

// Everything a widget write must pass before it is stored: the sheet it reads
// exists and belongs to the workspace, its query makes sense for that sheet's
// columns (the engine's one rule set), and the dashboard's layout still fits.
// The engine's first issue becomes a named domain error so an LLM writing the
// dashboard reads exactly what to fix.

export type ResolvedSheet = { spreadsheetId: string; columns: ColumnMeta[] };

/**
 * Resolves a widget's sheet — the given id, or the workspace's own sheet when
 * none is given — and reads its columns once per id for the whole write.
 */
export function createSheetResolver(
  workspaceId: string,
): (spreadsheetId?: string) => Promise<ResolvedSheet> {
  const cache = new Map<string, Promise<ResolvedSheet>>();

  const load = async (spreadsheetId: string): Promise<ResolvedSheet> => {
    const columns = await spreadsheetService.columnsOf(spreadsheetId);
    return {
      spreadsheetId,
      columns: columns.map((column) => ({
        name: column.name,
        type: toWireColumnType(column.type),
      })),
    };
  };

  const resolveId = async (spreadsheetId?: string): Promise<string> => {
    if (spreadsheetId === undefined) {
      const workspace = await workspaceService.byId(workspaceId);
      if (workspace.spreadsheetId === null) {
        throw new SpreadsheetNotFoundError(`of workspace ${workspaceId}`);
      }
      return workspace.spreadsheetId;
    }
    const sheet = await prisma.spreadsheet.findUnique({
      where: { id: spreadsheetId },
      select: { workspaceId: true },
    });
    if (!sheet) throw new SpreadsheetNotFoundError(spreadsheetId);
    if (sheet.workspaceId !== workspaceId) {
      throw new DashboardSpreadsheetMismatchError(spreadsheetId, workspaceId);
    }
    return spreadsheetId;
  };

  return async (spreadsheetId) => {
    const id = await resolveId(spreadsheetId);
    let pending = cache.get(id);
    if (!pending) {
      pending = load(id);
      cache.set(id, pending);
    }
    return pending;
  };
}

/** The engine's first issue, as the domain error the contract names. */
export function assertWidgetValid(
  widget: Pick<WidgetInput, "type" | "variant" | "query">,
  columns: ColumnMeta[],
  path: readonly (string | number)[] = [],
): void {
  const issues = validateWidget(
    {
      type: widget.type,
      variant: widget.variant,
      query: toWidgetQuery(widget.query),
    },
    columns,
  );
  const first = issues[0];
  if (!first) return;
  const where = [...path, "query", ...first.path];
  switch (first.code) {
    case "UNKNOWN_COLUMN":
      throw new DashboardUnknownColumnError(first.detail ?? "", where);
    case "FORMULA_INVALID":
      throw new DashboardFormulaInvalidError(
        first.detail ?? first.message,
        where,
      );
    default:
      throw new DashboardQueryInvalidError(first.message, where);
  }
}

export function assertLayoutValid(
  widgets: readonly { row: number; column: number; sort: number }[],
): void {
  const issue = checkLayout(widgets);
  if (issue) throw new DashboardLayoutInvalidError(issue.message, issue.index);
}

/** A widget as `createMany` / `update` store it, minus the dashboard id. */
export type PreparedWidget = {
  spreadsheetId: string;
  name: string;
  description: string | null;
  type: WidgetTypeDb;
  variant: string;
  row: number;
  column: number;
  sort: number;
  height: WidgetHeightDb;
  query: Prisma.InputJsonValue;
};

export function toPreparedWidget(
  widget: WidgetInput,
  spreadsheetId: string,
): PreparedWidget {
  return {
    spreadsheetId,
    name: widget.name,
    description: widget.description,
    type: toDbWidgetType(widget.type),
    variant: widget.variant,
    row: widget.row,
    column: widget.column,
    sort: widget.sort,
    height: toDbWidgetHeight(widget.height),
    query: toJsonInput(widget.query),
  };
}

/**
 * Validates a whole set of widgets (a `replace`): each against its sheet, then
 * the layout as a set. Nothing is written here — a failure leaves the stored
 * dashboard untouched.
 */
export async function prepareWidgets(
  workspaceId: string,
  widgets: readonly WidgetInput[],
): Promise<PreparedWidget[]> {
  const resolve = createSheetResolver(workspaceId);
  const prepared: PreparedWidget[] = [];
  for (const [index, widget] of widgets.entries()) {
    const sheet = await resolve(widget.spreadsheetId);
    assertWidgetValid(widget, sheet.columns, ["widgets", index]);
    prepared.push(toPreparedWidget(widget, sheet.spreadsheetId));
  }
  assertLayoutValid(widgets);
  return prepared;
}
