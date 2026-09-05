import { tracked } from "@trpc/server";
import { idInput } from "../../common/schema";
import {
  runAiBatchInput,
  runAiCellInput,
  runAiChangesInput,
  runAiSheetInput,
} from "../../modules/run-ai/run-ai.schema";
import { runAiService } from "../../modules/run-ai/run-ai.service";
import { runAiChangesService } from "../../modules/run-ai/run-ai-changes.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// `runCell` is the one write: it records a pending run and hands it to the
// Trigger.dev worker; every later transition is the worker's, and the live
// stream carries them back (docs/features/run-ai.md).

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
   * Runs one AI cell: creates its `pending` run with the whole row (in
   * column sort order) and the column prompt as `result.input`, then
   * enqueues the `run-ai-cell` job. The run is returned as created; its
   * progress arrives through `onChange`.
   */
  runCell: publicProcedure
    .input(runAiCellInput)
    .mutation(({ input }) => runAiService.runCell(input).catch(mapDomainError)),

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
