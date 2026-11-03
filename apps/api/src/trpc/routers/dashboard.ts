import { idInput } from "../../common/schema";
import {
  createWidgetInput,
  replaceDashboardInput,
  updateDashboardInput,
  updateWidgetInput,
  workspaceIdInput,
} from "../../modules/dashboard/dashboard.schema";
import { dashboardService } from "../../modules/dashboard/dashboard.service";
import { dashboardWidgetsService } from "../../modules/dashboard/dashboard-widgets.service";
import { createTRPCRouter, mapDomainError, protectedProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the services.
// One dashboard per workspace, so the dashboard-level procedures take a
// workspaceId; widgets are addressed by their own id.

export const dashboardRouter = createTRPCRouter({
  byWorkspace: protectedProcedure
    .input(workspaceIdInput)
    .query(({ input }) =>
      dashboardService.byWorkspace(input.workspaceId).catch(mapDomainError),
    ),

  replace: protectedProcedure
    .input(replaceDashboardInput)
    .mutation(({ input }) =>
      dashboardService.replace(input).catch(mapDomainError),
    ),

  update: protectedProcedure
    .input(updateDashboardInput)
    .mutation(({ input }) =>
      dashboardService.update(input).catch(mapDomainError),
    ),

  remove: protectedProcedure
    .input(workspaceIdInput)
    .mutation(({ input }) =>
      dashboardService.remove(input.workspaceId).catch(mapDomainError),
    ),

  createWidget: protectedProcedure
    .input(createWidgetInput)
    .mutation(({ input }) =>
      dashboardWidgetsService.createWidget(input).catch(mapDomainError),
    ),

  updateWidget: protectedProcedure
    .input(updateWidgetInput)
    .mutation(({ input }) =>
      dashboardWidgetsService.updateWidget(input).catch(mapDomainError),
    ),

  removeWidget: protectedProcedure
    .input(idInput)
    .mutation(({ input }) =>
      dashboardWidgetsService.removeWidget(input.id).catch(mapDomainError),
    ),

  createStarter: protectedProcedure
    .input(workspaceIdInput)
    .mutation(({ input }) =>
      dashboardService.createStarter(input.workspaceId).catch(mapDomainError),
    ),
});
