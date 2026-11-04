import { idInput } from "../../common/schema";
import { externalApiCellInput } from "../../modules/external-api/external-api.schema";
import { externalApiService } from "../../modules/external-api/external-api.service";
import { createTRPCRouter, mapDomainError, protectedProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// Read-only: the writers are the processors that run inside the Trigger.dev
// worker (`src/ai/cell-markdown.ts`, `src/ai/cell-crawls.ts`), and deletion is the `cellId`
// foreign key's cascade (docs/features/external-api.md).

export const externalApiRouter = createTRPCRouter({
  byId: protectedProcedure
    .input(idInput)
    .query(({ input }) =>
      externalApiService.byId(input.id).catch(mapDomainError),
    ),

  /** Everything an external service has produced for one cell, newest first. */
  listByCell: protectedProcedure
    .input(externalApiCellInput)
    .query(({ input }) => externalApiService.listByCell(input.cellId)),
});
