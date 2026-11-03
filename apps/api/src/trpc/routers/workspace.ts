import { idInput } from "../../common/schema";
import {
  createWorkspaceInput,
  renameWorkspaceInput,
} from "../../modules/workspace/workspace.schema";
import { workspaceService } from "../../modules/workspace/workspace.service";
import { createTRPCRouter, mapDomainError, protectedProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// `create` also creates the workspace's same-named spreadsheet; `rename`
// renames it (docs/plans/013-workspaces.md).

export const workspaceRouter = createTRPCRouter({
  list: protectedProcedure.query(() => workspaceService.list()),

  byId: protectedProcedure
    .input(idInput)
    .query(({ input }) =>
      workspaceService.byId(input.id).catch(mapDomainError),
    ),

  create: protectedProcedure
    .input(createWorkspaceInput)
    .mutation(({ input }) =>
      workspaceService.create(input).catch(mapDomainError),
    ),

  rename: protectedProcedure
    .input(renameWorkspaceInput)
    .mutation(({ input }) =>
      workspaceService.rename(input).catch(mapDomainError),
    ),

  remove: protectedProcedure
    .input(idInput)
    .mutation(({ input }) =>
      workspaceService.remove(input.id).catch(mapDomainError),
    ),
});
