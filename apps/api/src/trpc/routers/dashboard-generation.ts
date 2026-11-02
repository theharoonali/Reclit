import { tracked } from "@trpc/server";
import { idInput, workspaceIdInput } from "../../common/schema";
import {
  generationChangesInput,
  startGenerationInput,
} from "../../modules/dashboard-generation/dashboard-generation.schema";
import { dashboardGenerationService } from "../../modules/dashboard-generation/dashboard-generation.service";
import { dashboardGenerationChangesService } from "../../modules/dashboard-generation/dashboard-generation-changes.service";
import { dashboardGenerationControlService } from "../../modules/dashboard-generation/dashboard-generation-control.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the services.
// `start` records a generation and hands it to the Trigger.dev worker;
// `cancel` reaches the same worker; every other transition is the worker's,
// and the live stream carries them back (docs/features/dashboard-generation.md).

export const dashboardGenerationRouter = createTRPCRouter({
  /** Starts a generation for the workspace's sheet; the page then follows `onChange`. */
  start: publicProcedure
    .input(startGenerationInput)
    .mutation(({ input }) =>
      dashboardGenerationControlService.start(input).catch(mapDomainError),
    ),

  byId: publicProcedure
    .input(idInput)
    .query(({ input }) =>
      dashboardGenerationService.byId(input.id).catch(mapDomainError),
    ),

  /** The workspace's active generation, or null — non-null means the page should be streaming. */
  active: publicProcedure
    .input(workspaceIdInput)
    .query(({ input }) => dashboardGenerationService.active(input.workspaceId)),

  /** The workspace's newest generation, finished or not — what a reload shows. */
  latest: publicProcedure
    .input(workspaceIdInput)
    .query(({ input }) => dashboardGenerationService.latest(input.workspaceId)),

  cancel: publicProcedure
    .input(idInput)
    .mutation(({ input }) =>
      dashboardGenerationControlService.cancel(input.id).catch(mapDomainError),
    ),

  /**
   * SSE stream of one workspace's generation: replay since `lastEventId`, a
   * snapshot of the active generation, then live changes until a terminal
   * change leaves nothing active, when `closed` is the last event. Each event
   * is `tracked` by the row's `updatedAt` (ms).
   */
  onChange: publicProcedure
    .input(generationChangesInput)
    .subscription(async function* ({ input, signal }) {
      for await (const event of dashboardGenerationChangesService.changes(
        input,
        signal,
      )) {
        yield tracked(event.id, event.change);
      }
    }),
});
