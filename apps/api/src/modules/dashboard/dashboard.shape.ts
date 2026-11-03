import type { Prisma } from "../../../generated/prisma/client";
import {
  type DashboardDetail,
  type DashboardWidget,
  toWireWidgetHeight,
  toWireWidgetType,
} from "./dashboard.schema";

// The one select per shape, and the pure record → wire mappers both services
// share. Type-only Prisma import: nothing here runs a query.
//
// The dashboard is not a table of its own: its columns live on Workspace
// (`dashboardCreatedAt` null = no dashboard) and its widgets point at the
// workspace. On the wire the dashboard keeps its own shape, and its `id` (and
// each widget's `dashboardId`) is the workspace id.

export const widgetSelect = {
  id: true,
  workspaceId: true,
  spreadsheetId: true,
  name: true,
  description: true,
  type: true,
  variant: true,
  row: true,
  column: true,
  sort: true,
  height: true,
  query: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** A workspace's dashboard columns, widgets ordered the way the grid lays them out: by row, then sort. */
export const dashboardSelect = {
  id: true,
  dashboardCreatedAt: true,
  dashboardTitle: true,
  dashboardDescription: true,
  updatedAt: true,
  dashboardWidgets: {
    select: widgetSelect,
    orderBy: [{ row: "asc" as const }, { sort: "asc" as const }],
  },
} satisfies Prisma.WorkspaceSelect;

export type WidgetRecord = Prisma.DashboardWidgetGetPayload<{
  select: typeof widgetSelect;
}>;
export type DashboardRecord = Prisma.WorkspaceGetPayload<{
  select: typeof dashboardSelect;
}>;

export function toDashboardWidget(record: WidgetRecord): DashboardWidget {
  const { workspaceId, ...rest } = record;
  return {
    ...rest,
    dashboardId: workspaceId,
    type: toWireWidgetType(record.type),
    height: toWireWidgetHeight(record.height),
    // The service is the only writer and validates every query on write (the
    // `ExternalApi.output` precedent).
    query: record.query as DashboardWidget["query"],
  };
}

/** The workspace's dashboard, or null while it has none. */
export function toDashboardDetail(
  record: DashboardRecord,
): DashboardDetail | null {
  if (!record.dashboardCreatedAt) return null;
  return {
    id: record.id,
    workspaceId: record.id,
    title: record.dashboardTitle,
    description: record.dashboardDescription,
    createdAt: record.dashboardCreatedAt,
    updatedAt: record.updatedAt,
    widgets: record.dashboardWidgets.map(toDashboardWidget),
  };
}
