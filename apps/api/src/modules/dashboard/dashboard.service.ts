import { isRecordNotFound } from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import { workspaceService } from "../workspace/workspace.service";
import {
  DashboardNotEmptyError,
  DashboardNotFoundError,
} from "./dashboard.errors";
import type {
  DashboardDetail,
  ReplaceDashboardInput,
  UpdateDashboardInput,
} from "./dashboard.schema";
import { dashboardSelect, toDashboardDetail } from "./dashboard.shape";
import { buildStarterWidgets } from "./dashboard-starter";
import { createSheetResolver, prepareWidgets } from "./dashboard-validate";

// Framework-free (docs/rules/BACKEND.md hard rule 1). One dashboard per
// workspace, created lazily by the first write; it holds configuration only.
// `replace` is the LLM's call: validate everything first, then swap the whole
// widget set in one transaction, so a bad payload changes nothing.

export class DashboardService {
  async byWorkspace(workspaceId: string): Promise<DashboardDetail | null> {
    await workspaceService.byId(workspaceId);
    const record = await prisma.dashboard.findUnique({
      where: { workspaceId },
      select: dashboardSelect,
    });
    return record ? toDashboardDetail(record) : null;
  }

  async byId(id: string): Promise<DashboardDetail> {
    const record = await prisma.dashboard.findUnique({
      where: { id },
      select: dashboardSelect,
    });
    if (!record) throw new DashboardNotFoundError(id);
    return toDashboardDetail(record);
  }

  /** Atomic full replace; the dashboard is created when the workspace has none. */
  async replace(input: ReplaceDashboardInput): Promise<DashboardDetail> {
    await workspaceService.byId(input.workspaceId);
    const widgets = await prepareWidgets(input.workspaceId, input.widgets);
    const record = await prisma.$transaction(async (tx) => {
      const dashboard = await tx.dashboard.upsert({
        where: { workspaceId: input.workspaceId },
        create: {
          workspaceId: input.workspaceId,
          title: input.title ?? null,
          description: input.description ?? null,
        },
        update: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        },
        select: { id: true },
      });
      await tx.dashboardWidget.deleteMany({
        where: { dashboardId: dashboard.id },
      });
      if (widgets.length > 0) {
        await tx.dashboardWidget.createMany({
          data: widgets.map((widget) => ({
            ...widget,
            dashboardId: dashboard.id,
          })),
        });
      }
      return tx.dashboard.findUniqueOrThrow({
        where: { id: dashboard.id },
        select: dashboardSelect,
      });
    });
    return toDashboardDetail(record);
  }

  /** Title and subtitle only; `null` clears, omitted leaves alone. */
  async update(input: UpdateDashboardInput): Promise<DashboardDetail> {
    try {
      const record = await prisma.dashboard.update({
        where: { workspaceId: input.workspaceId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        },
        select: dashboardSelect,
      });
      return toDashboardDetail(record);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new DashboardNotFoundError(input.workspaceId);
      }
      throw error;
    }
  }

  /** FK cascade removes the widgets. */
  async remove(workspaceId: string): Promise<{ id: string }> {
    try {
      return await prisma.dashboard.delete({
        where: { workspaceId },
        select: { id: true },
      });
    } catch (error) {
      if (isRecordNotFound(error))
        throw new DashboardNotFoundError(workspaceId);
      throw error;
    }
  }

  /**
   * Fills an empty dashboard from the workspace sheet's columns
   * (`buildStarterWidgets`). Refuses to overwrite widgets: that is `replace`.
   */
  async createStarter(workspaceId: string): Promise<DashboardDetail> {
    const existing = await this.byWorkspace(workspaceId);
    if (existing && existing.widgets.length > 0) {
      throw new DashboardNotEmptyError(workspaceId);
    }
    const sheet = await createSheetResolver(workspaceId)();
    return this.replace({
      workspaceId,
      widgets: buildStarterWidgets(sheet.columns),
    });
  }
}

export const dashboardService = new DashboardService();
