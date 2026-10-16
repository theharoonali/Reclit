import type { Prisma } from "../../../generated/prisma/client";
import {
  type DashboardDetail,
  type DashboardWidget,
  toWireWidgetHeight,
  toWireWidgetType,
} from "./dashboard.schema";

// The one select per shape, and the pure record → wire mappers both services
// share. Type-only Prisma import: nothing here runs a query.

export const widgetSelect = {
  id: true,
  dashboardId: true,
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

/** Widgets ordered the way the grid lays them out: by row, then sort. */
export const dashboardSelect = {
  id: true,
  workspaceId: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  widgets: {
    select: widgetSelect,
    orderBy: [{ row: "asc" as const }, { sort: "asc" as const }],
  },
} satisfies Prisma.DashboardSelect;

export type WidgetRecord = Prisma.DashboardWidgetGetPayload<{
  select: typeof widgetSelect;
}>;
export type DashboardRecord = Prisma.DashboardGetPayload<{
  select: typeof dashboardSelect;
}>;

export function toDashboardWidget(record: WidgetRecord): DashboardWidget {
  return {
    ...record,
    type: toWireWidgetType(record.type),
    height: toWireWidgetHeight(record.height),
    // The service is the only writer and validates every query on write (the
    // `ExternalApi.output` precedent).
    query: record.query as DashboardWidget["query"],
  };
}

export function toDashboardDetail(record: DashboardRecord): DashboardDetail {
  return { ...record, widgets: record.widgets.map(toDashboardWidget) };
}
