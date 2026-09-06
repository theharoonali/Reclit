import { tracked } from "@trpc/server";
import { idInput } from "../../common/schema";
import {
  runAiBatchInput,
  runAiCellsInput,
  runAiChangesInput,
  runAiSheetInput,
} from "../../modules/run-ai/run-ai.schema";
import { runAiService } from "../../modules/run-ai/run-ai.service";
import { runAiBatchService } from "../../modules/run-ai/run-ai-batch.service";
import { runAiChangesService } from "../../modules/run-ai/run-ai-changes.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the services.
// `runCells` is the one write: it records the pending runs of a selection and
// hands them to the Trigger.dev worker; every later transition is the
// worker's, and the live stream carries them back (docs/features/run-ai.md).

export const runAiRouter = createTRPCRouter({
  byId: publicProcedure
    .input(idInput)
    .query(({ input }) => runAiService.byId(input.id).catch(mapDomainError)),

  listByBatch: publicProcedure
    .input(runAiBatchInput)
    .query(({ input }) => runAiService.listByBatch(input.batchId)),

  /** The sheet's working runs — non-empty means the sheet should be streaming. */
  listActive: publicProcedure
    .input(runAiSheetInput)
    .query(({ input }) =>
      runAiService.listActiveBySpreadsheet(input.spreadsheetId),
    ),

  /**
   * Runs the AI cells of a rectangle: one `pending` run per selected row and
   * AI column under one batch id, then enqueues the `run-ai-batch` job. The
   * runs are returned as created, in series order; their progress arrives
   * through `onChange`.
   */
  runCells: publicProcedure
    .input(runAiCellsInput)
    .mutation(({ input }) =>
      runAiBatchService.runCells(input).catch(mapDomainError),
    ),

  /**
   * SSE stream of one sheet's runs: replay since `lastEventId`, a snapshot
   * of the working runs, then live changes until a terminal change leaves
   * nothing working, when `closed` is the last event. Each event is
   * `tracked` by the run's `updatedAt` (ms), which is what tRPC hands back
   * as `lastEventId` when the client reconnects.
   */
  onChange: publicProcedure
    .input(runAiChangesInput)
    .subscription(async function* ({ input, signal }) {
      for await (const event of runAiChangesService.changes(input, signal)) {
        yield tracked(event.id, event.change);
      }
    }),
});
