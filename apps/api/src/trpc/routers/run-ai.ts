import { idInput } from "../../common/schema";
import { runAiBatchInput } from "../../modules/run-ai/run-ai.schema";
import { runAiService } from "../../modules/run-ai/run-ai.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// Reads only: writes are service-only (docs/features/run-ai.md).

export const runAiRouter = createTRPCRouter({
  byId: publicProcedure
    .input(idInput)
    .query(({ input }) => runAiService.byId(input.id).catch(mapDomainError)),

  listByBatch: publicProcedure
    .input(runAiBatchInput)
    .query(({ input }) => runAiService.listByBatch(input.batchId)),
});
