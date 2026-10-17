import {
  type AssistantPromptContext,
  MAX_SAMPLE_ROWS,
} from "../../ai/assistant-prompt";
import type { DashboardDetail } from "../dashboard/dashboard.schema";
import { dashboardService } from "../dashboard/dashboard.service";
import type {
  SheetColumn,
  SheetPayload,
  SheetRow,
} from "../spreadsheet/spreadsheet.schema";
import { MAX_IMPORT_ROWS } from "../spreadsheet/spreadsheet.schema";
import { spreadsheetService } from "../spreadsheet/spreadsheet.service";
import { workspaceService } from "../workspace/workspace.service";
import type { AssistantRun } from "./assistant.schema";

// Reads only, through the other features' services: what the model is told
// about the workspace before its first step, and the whole sheet for the rule
// tools. Framework-free; nothing here writes.

/** One `spreadsheet.rows` page — the contract's maximum. */
const PAGE = 500;

export type AssistantContext = {
  workspaceName: string;
  sheet: { id: string; name: string; storedRows: number };
  columns: SheetColumn[];
  sampleRows: SheetRow[];
  /** Dashboard scope only; null when the workspace has none yet. */
  dashboard: DashboardDetail | null;
};

export async function loadAssistantContext(
  run: AssistantRun,
  sheetId: string,
): Promise<AssistantContext> {
  const [workspace, storedRows, page, dashboard] = await Promise.all([
    workspaceService.byId(run.workspaceId),
    spreadsheetService.countRows(sheetId),
    spreadsheetService.rows({
      id: sheetId,
      startRow: 0,
      limit: MAX_SAMPLE_ROWS,
    }),
    run.scope === "dashboard"
      ? dashboardService.byWorkspace(run.workspaceId)
      : Promise.resolve(null),
  ]);
  return {
    workspaceName: workspace.name,
    sheet: { id: sheetId, name: page.spreadsheet.name, storedRows },
    columns: page.columns,
    sampleRows: page.rows,
    dashboard,
  };
}

/** The context as the pure prompt builder takes it. */
export function toPromptContext(
  run: AssistantRun,
  context: AssistantContext,
): AssistantPromptContext {
  return {
    scope: run.scope,
    workspaceName: context.workspaceName,
    sheet: { name: context.sheet.name, storedRows: context.sheet.storedRows },
    columns: context.columns.map(({ name, type, node }) => ({
      name,
      type,
      node,
    })),
    sampleRows: context.sampleRows.map((row) => ({
      index: row.index,
      cells: row.columns.map(({ name, value }) => ({ name, value })),
    })),
    dashboard: context.dashboard
      ? {
          title: context.dashboard.title,
          description: context.dashboard.description,
          widgets: context.dashboard.widgets.map((widget) => ({
            id: widget.id,
            name: widget.name,
            type: widget.type,
            variant: widget.variant,
            row: widget.row,
            column: widget.column,
            sort: widget.sort,
            height: widget.height,
            query: widget.query,
          })),
        }
      : null,
  };
}

/**
 * Every stored row of the sheet, page by page, capped at the import cap
 * (20,000 rows) — what a rule tool evaluates its `where` against. The next
 * page starts after the last index read, so no cursor parsing is needed.
 */
export async function readAllRows(sheetId: string): Promise<SheetPayload> {
  const rows: SheetRow[] = [];
  let first: SheetPayload | null = null;
  let startRow = 0;
  for (;;) {
    const page = await spreadsheetService.rows({
      id: sheetId,
      startRow,
      limit: PAGE,
    });
    first ??= page;
    rows.push(...page.rows);
    const last = page.rows.at(-1);
    if (!page.pagination.hasMore || !last || rows.length >= MAX_IMPORT_ROWS) {
      break;
    }
    startRow = last.index + 1;
  }
  if (!first) throw new Error("unreachable: the first page always exists");
  return {
    ...first,
    rows,
    pagination: { ...first.pagination, hasMore: false, nextCursor: null },
  };
}
