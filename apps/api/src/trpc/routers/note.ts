import {
  createNoteInput,
  noteIdInput,
  updateNoteInput,
} from "../../modules/note/note.schema";
import { noteService } from "../../modules/note/note.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// Nothing here may import @nestjs/* (AGENTS.md invariant 2).

export const noteRouter = createTRPCRouter({
  list: publicProcedure.query(() => noteService.list()),

  byId: publicProcedure
    .input(noteIdInput)
    .query(({ input }) => noteService.byId(input.id).catch(mapDomainError)),

  create: publicProcedure
    .input(createNoteInput)
    .mutation(({ input }) => noteService.create(input)),

  update: publicProcedure
    .input(updateNoteInput)
    .mutation(({ input }) => noteService.update(input).catch(mapDomainError)),

  remove: publicProcedure
    .input(noteIdInput)
    .mutation(({ input }) =>
      noteService.remove(input.id).catch(mapDomainError),
    ),
});
