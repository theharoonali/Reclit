import { placeWidget } from "@reclit/dashboard-engine";
import { isRecordNotFound } from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import { workspaceService } from "../workspace/workspace.service";
import { DashboardWidgetNotFoundError } from "./dashboard.errors";
import type {
  CreateWidgetInput,
  DashboardDetail,
  UpdateWidgetInput,
  WidgetInput,
} from "./dashboard.schema";
import { dashboardService } from "./dashboard.service";
import {
  dashboardSelect,
  toDashboardDetail,
  toDashboardWidget,
  widgetSelect,
} from "./dashboard.shape";
import {
  assertLayoutValid,
  assertWidgetValid,
  createSheetResolver,
  toPreparedWidget,
} from "./dashboard-validate";

// One widget at a time — the incremental edits beside `replace`. Every write
// returns the whole dashboard: the layout is a dashboard-wide invariant and
// the client holds one query for it.

const slotSelect = { id: true, row: true, column: true, sort: true } as const;

export class DashboardWidgetsService {
  /**
   * Creates the dashboard too when the workspace has none. A widget without
   * a `row` and `sort` is placed inside the transaction, against the slots
   * as they are then: the first row with room for its width, else a new row.
   */
  async createWidget(input: CreateWidgetInput): Promise<DashboardDetail> {
    const { workspaceId, row, sort, ...rest } = input;
    await workspaceService.byId(workspaceId);
    const sheet = await createSheetResolver(workspaceId)(rest.spreadsheetId);
    assertWidgetValid(rest, sheet.columns);
    const record = await prisma.$transaction(async (tx) => {
      const dashboard = await tx.dashboard.upsert({
        where: { workspaceId },
        create: { workspaceId },
        update: {},
        select: { id: true, widgets: { select: slotSelect } },
      });
      const placement =
        row !== undefined && sort !== undefined
          ? { row, sort }
          : placeWidget(dashboard.widgets, rest.column, row);
      const widget: WidgetInput = { ...rest, ...placement };
      assertLayoutValid([...dashboard.widgets, widget]);
      await tx.dashboardWidget.create({
        data: {
          ...toPreparedWidget(widget, sheet.spreadsheetId),
          dashboardId: dashboard.id,
        },
        select: { id: true },
      });
      return tx.dashboard.findUniqueOrThrow({
        where: { id: dashboard.id },
        select: dashboardSelect,
      });
    });
    return toDashboardDetail(record);
  }

  /**
   * Stored ⊕ patch is validated as a whole: the query against the sheet when
   * anything the query depends on changes, the layout always.
   */
  async updateWidget(input: UpdateWidgetInput): Promise<DashboardDetail> {
    const { id, ...patch } = input;
    const stored = await prisma.dashboardWidget.findUnique({
      where: { id },
      select: {
        ...widgetSelect,
        dashboard: {
          select: { workspaceId: true, widgets: { select: slotSelect } },
        },
      },
    });
    if (!stored) throw new DashboardWidgetNotFoundError(id);
    const current = toDashboardWidget(stored);
    const merged: WidgetInput = {
      spreadsheetId: patch.spreadsheetId ?? stored.spreadsheetId,
      name: patch.name ?? stored.name,
      description:
        patch.description === undefined
          ? stored.description
          : patch.description,
      type: patch.type ?? current.type,
      variant: patch.variant ?? stored.variant,
      row: patch.row ?? stored.row,
      column: patch.column ?? stored.column,
      sort: patch.sort ?? stored.sort,
      height: patch.height ?? current.height,
      query: patch.query ?? current.query,
    };

    const { workspaceId } = stored.dashboard;
    let spreadsheetId = stored.spreadsheetId;
    const touchesQuery =
      patch.query !== undefined ||
      patch.spreadsheetId !== undefined ||
      patch.type !== undefined ||
      patch.variant !== undefined;
    if (touchesQuery) {
      const sheet = await createSheetResolver(workspaceId)(
        merged.spreadsheetId,
      );
      spreadsheetId = sheet.spreadsheetId;
      assertWidgetValid(merged, sheet.columns);
    }
    assertLayoutValid([
      ...stored.dashboard.widgets.filter((other) => other.id !== id),
      merged,
    ]);

    const updated = await prisma.dashboardWidget.update({
      where: { id },
      data: toPreparedWidget(merged, spreadsheetId),
      select: { dashboardId: true },
    });
    return dashboardService.byId(updated.dashboardId);
  }

  async removeWidget(id: string): Promise<DashboardDetail> {
    try {
      const removed = await prisma.dashboardWidget.delete({
        where: { id },
        select: { dashboardId: true },
      });
      return await dashboardService.byId(removed.dashboardId);
    } catch (error) {
      if (isRecordNotFound(error)) throw new DashboardWidgetNotFoundError(id);
      throw error;
    }
  }
}

export const dashboardWidgetsService = new DashboardWidgetsService();
