import { tracked } from "@trpc/server";
import { idInput } from "../../common/schema";
import {
  runAiBatchInput,
  runAiChangesInput,
  runAiSheetInput,
} from "../../modules/run-ai/run-ai.schema";
import { runAiService } from "../../modules/run-ai/run-ai.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// Writes are service-only and REST (`POST /run-ai/test`); tRPC exposes the
// reads and the live stream (docs/features/run-ai.md).

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
   * SSE stream of one sheet's runs: replay since `lastEventId`, a snapshot
   * of the working runs, then live changes until a terminal change leaves
   * nothing working, when `closed` is the last event. Each event is
   * `tracked` by the run's `updatedAt` (ms), which is what tRPC hands back
   * as `lastEventId` when the client reconnects.
   */
  onChange: publicProcedure
    .input(runAiChangesInput)
    .subscription(async function* ({ input, signal }) {
      for await (const event of runAiService.changes(input, signal)) {
        yield tracked(event.id, event.change);
      }
    }),
});
