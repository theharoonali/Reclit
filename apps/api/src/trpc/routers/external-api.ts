import { idInput } from "../../common/schema";
import { externalApiCellInput } from "../../modules/external-api/external-api.schema";
import { externalApiService } from "../../modules/external-api/external-api.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// Read-only: the writers are the processors that run inside the Trigger.dev
// worker (`src/ai/cell-transcripts.ts` today), and deletion is the `cellId`
// foreign key's cascade (docs/features/external-api.md).

export const externalApiRouter = createTRPCRouter({
  byId: publicProcedure
    .input(idInput)
    .query(({ input }) =>
      externalApiService.byId(input.id).catch(mapDomainError),
    ),

  /** Everything an external service has produced for one cell, newest first. */
  listByCell: publicProcedure
    .input(externalApiCellInput)
    .query(({ input }) => externalApiService.listByCell(input.cellId)),
});
