import { tracked } from "@trpc/server";
import { idInput, workspaceIdInput } from "../../common/schema";
import {
  assistantChangesInput,
  recommendWidgetsInput,
  respondAssistantInput,
  startAssistantInput,
} from "../../modules/assistant/assistant.schema";
import { assistantService } from "../../modules/assistant/assistant.service";
import { assistantChangesService } from "../../modules/assistant/assistant-changes.service";
import { assistantControlService } from "../../modules/assistant/assistant-control.service";
import { assistantRecommendService } from "../../modules/assistant/assistant-recommend.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the services.
// `start` records a run and hands it to the Trigger.dev worker; `cancel` and
// `respond` reach the same worker; every other transition is the worker's,
// and the live stream carries them back (docs/features/assistant.md).

export const assistantRouter = createTRPCRouter({
  /** Starts a run for the workspace's sheet; the capsule then follows `onChange`. */
  start: publicProcedure
    .input(startAssistantInput)
    .mutation(({ input }) =>
      assistantControlService.start(input).catch(mapDomainError),
    ),

  byId: publicProcedure
    .input(idInput)
    .query(({ input }) =>
      assistantService.byId(input.id).catch(mapDomainError),
    ),

  /** The workspace's active run, or null — non-null means the capsule should be streaming. */
  active: publicProcedure
    .input(workspaceIdInput)
    .query(({ input }) => assistantService.active(input.workspaceId)),

  cancel: publicProcedure
    .input(idInput)
    .mutation(({ input }) =>
      assistantControlService.cancel(input.id).catch(mapDomainError),
    ),

  /** The user's answer to the pending delete confirmation. */
  respond: publicProcedure
    .input(respondAssistantInput)
    .mutation(({ input }) =>
      assistantControlService.respond(input).catch(mapDomainError),
    ),

  /**
   * One synchronous model call, no run: up to six cards that make sense for
   * the workspace's sheet, each validated against it. The client adds the
   * ones it wants through `dashboard.createWidget`, which places them.
   */
  recommendWidgets: publicProcedure
    .input(recommendWidgetsInput)
    .mutation(({ input }) =>
      assistantRecommendService.recommend(input).catch(mapDomainError),
    ),

  /**
   * SSE stream of one workspace's run: replay since `lastEventId`, a snapshot
   * of the active run, then live changes until a terminal change leaves
   * nothing active, when `closed` is the last event. Each event is `tracked`
   * by the run's `updatedAt` (ms), which is what tRPC hands back as
   * `lastEventId` when the client reconnects.
   */
  onChange: publicProcedure
    .input(assistantChangesInput)
    .subscription(async function* ({ input, signal }) {
      for await (const event of assistantChangesService.changes(
        input,
        signal,
      )) {
        yield tracked(event.id, event.change);
      }
    }),
});
