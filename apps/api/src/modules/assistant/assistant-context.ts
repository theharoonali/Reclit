import { type ColumnProfile, profileColumns } from "@reclit/dashboard-engine";
import {
  type AssistantPromptContext,
  MAX_SAMPLE_ROWS,
  withPendingAiColumns,
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
import type { AssistantScopeWire } from "./assistant.schema";

// Reads only, through the other features' services: what the model is told
// about the workspace before its first step (and before a recommendation
// call), and the whole sheet for the rule tools. Framework-free; nothing here
// writes.

/** One `spreadsheet.rows` page — the contract's maximum. */
const PAGE = 500;

/** The rows the dashboard scope profiles: enough to read a column's role, four pages at most. */
export const MAX_PROFILE_ROWS = 2000;

export type AssistantContextInput = {
  workspaceId: string;
  scope: AssistantScopeWire;
  sheetId: string;
};

export type AssistantContext = {
  workspaceName: string;
  sheet: {
    id: string;
    name: string;
    storedRows: number;
    description: string | null;
    purpose: string | null;
  };
  columns: SheetColumn[];
  sampleRows: SheetRow[];
  /** Dashboard scope only: the columns profiled over the first `profiledRows` rows. */
  profile: ColumnProfile[] | null;
  profiledRows: number;
  /** Dashboard scope only; null when the workspace has none yet. */
  dashboard: DashboardDetail | null;
};

export async function loadAssistantContext({
  workspaceId,
  scope,
  sheetId,
}: AssistantContextInput): Promise<AssistantContext> {
  const forDashboard = scope === "dashboard";
  const [workspace, meta, storedRows, payload, dashboard] = await Promise.all([
    workspaceService.byId(workspaceId),
    spreadsheetService.byId(sheetId),
    spreadsheetService.countRows(sheetId),
    readAllRows(sheetId, forDashboard ? MAX_PROFILE_ROWS : MAX_SAMPLE_ROWS),
    forDashboard
      ? dashboardService.byWorkspace(workspaceId)
      : Promise.resolve(null),
  ]);
  return {
    workspaceName: workspace.name,
    sheet: {
      id: sheetId,
      name: payload.spreadsheet.name,
      storedRows,
      description: meta.description,
      purpose: meta.purpose,
    },
    columns: payload.columns,
    sampleRows: payload.rows.slice(0, MAX_SAMPLE_ROWS),
    profile: forDashboard ? profileColumns(payload) : null,
    profiledRows: payload.rows.length,
    dashboard,
  };
}

/** The context as the pure prompt builder takes it. */
export function toPromptContext(
  scope: AssistantScopeWire,
  context: AssistantContext,
): AssistantPromptContext {
  return {
    scope,
    workspaceName: context.workspaceName,
    sheet: {
      name: context.sheet.name,
      storedRows: context.sheet.storedRows,
      description: context.sheet.description,
      purpose: context.sheet.purpose,
    },
    columns: context.columns.map(({ name, type, node, prompt }) => ({
      name,
      type,
      node,
      prompt,
    })),
    sampleRows: context.sampleRows.map((row) => ({
      index: row.index,
      cells: row.columns.map(({ name, value }) => ({ name, value })),
    })),
    profile: context.profile
      ? withPendingAiColumns(context.profile, context.columns)
      : null,
    profiledRows: context.profiledRows,
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
 * The first `maxRows` stored rows of the sheet, page by page — every row by
 * default (the import cap, 20,000), what a rule tool evaluates its `where`
 * against. The next page starts after the last index read, so no cursor
 * parsing is needed.
 */
export async function readAllRows(
  sheetId: string,
  maxRows = MAX_IMPORT_ROWS,
): Promise<SheetPayload> {
  const rows: SheetRow[] = [];
  let first: SheetPayload | null = null;
  let startRow = 0;
  for (;;) {
    const page = await spreadsheetService.rows({
      id: sheetId,
      startRow,
      limit: Math.min(PAGE, maxRows - rows.length),
    });
    first ??= page;
    rows.push(...page.rows);
    const last = page.rows.at(-1);
    if (!page.pagination.hasMore || !last || rows.length >= maxRows) break;
    startRow = last.index + 1;
  }
  if (!first) throw new Error("unreachable: the first page always exists");
  return {
    ...first,
    rows: rows.slice(0, maxRows),
    pagination: { ...first.pagination, hasMore: false, nextCursor: null },
  };
}
