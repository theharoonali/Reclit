import type { Prisma } from "../../../generated/prisma/client";
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
// workspace, stored on the workspace row itself (`dashboardCreatedAt` null =
// none yet) and created lazily by the first write; it holds configuration
// only. `replace` is the LLM's call: validate everything first, then swap the
// whole widget set in one transaction, so a bad payload changes nothing.

/** Creates the workspace's dashboard when it has none; inside the caller's transaction. */
export async function ensureDashboard(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  await tx.workspace.updateMany({
    where: { id: workspaceId, dashboardCreatedAt: null },
    data: { dashboardCreatedAt: new Date() },
  });
}

/** The `title` / `description` patch as workspace columns; `null` clears, omitted leaves alone. */
function headerData(input: {
  title?: string | null;
  description?: string | null;
}): Prisma.WorkspaceUpdateInput {
  return {
    ...(input.title !== undefined ? { dashboardTitle: input.title } : {}),
    ...(input.description !== undefined
      ? { dashboardDescription: input.description }
      : {}),
  };
}

export class DashboardService {
  async byWorkspace(workspaceId: string): Promise<DashboardDetail | null> {
    await workspaceService.byId(workspaceId);
    return this.find(workspaceId);
  }

  /** `id` is the dashboard's id, which is its workspace's id. */
  async byId(id: string): Promise<DashboardDetail> {
    const dashboard = await this.find(id);
    if (!dashboard) throw new DashboardNotFoundError(id);
    return dashboard;
  }

  /** Atomic full replace; the dashboard is created when the workspace has none. */
  async replace(input: ReplaceDashboardInput): Promise<DashboardDetail> {
    const { workspaceId } = input;
    await workspaceService.byId(workspaceId);
    const widgets = await prepareWidgets(workspaceId, input.widgets);
    const record = await prisma.$transaction(async (tx) => {
      await ensureDashboard(tx, workspaceId);
      await tx.workspace.update({
        where: { id: workspaceId },
        data: headerData(input),
      });
      await tx.dashboardWidget.deleteMany({ where: { workspaceId } });
      if (widgets.length > 0) {
        await tx.dashboardWidget.createMany({
          data: widgets.map((widget) => ({ ...widget, workspaceId })),
        });
      }
      return tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: dashboardSelect,
      });
    });
    return written(toDashboardDetail(record), workspaceId);
  }

  /** Title and subtitle only; `null` clears, omitted leaves alone. */
  async update(input: UpdateDashboardInput): Promise<DashboardDetail> {
    const { count } = await prisma.workspace.updateMany({
      where: { id: input.workspaceId, dashboardCreatedAt: { not: null } },
      data: headerData(input) as Prisma.WorkspaceUpdateManyMutationInput,
    });
    if (count === 0) throw new DashboardNotFoundError(input.workspaceId);
    return this.byId(input.workspaceId);
  }

  /** Clears the workspace's dashboard columns and removes its widgets. */
  async remove(workspaceId: string): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.workspace.updateMany({
        where: { id: workspaceId, dashboardCreatedAt: { not: null } },
        data: {
          dashboardCreatedAt: null,
          dashboardTitle: null,
          dashboardDescription: null,
        },
      });
      if (count === 0) throw new DashboardNotFoundError(workspaceId);
      await tx.dashboardWidget.deleteMany({ where: { workspaceId } });
      return { id: workspaceId };
    });
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

  private async find(workspaceId: string): Promise<DashboardDetail | null> {
    const record = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: dashboardSelect,
    });
    return record ? toDashboardDetail(record) : null;
  }
}

/** A dashboard just written exists; a null here is a broken invariant. */
export function written(
  dashboard: DashboardDetail | null,
  workspaceId: string,
): DashboardDetail {
  if (!dashboard) throw new DashboardNotFoundError(workspaceId);
  return dashboard;
}

export const dashboardService = new DashboardService();
