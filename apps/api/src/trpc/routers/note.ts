import { TRPCError } from "@trpc/server";
import {
  createNoteInput,
  noteIdInput,
  updateNoteInput,
} from "../../modules/note/note.schema";
import {
  NoteNotFoundError,
  noteService,
} from "../../modules/note/note.service";
import { createTRPCRouter, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// Nothing here may import @nestjs/* (AGENTS.md invariant 2).

function toTRPCError(error: unknown): never {
  if (error instanceof NoteNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  throw error;
}

export const noteRouter = createTRPCRouter({
  list: publicProcedure.query(() => noteService.list()),

  byId: publicProcedure.input(noteIdInput).query(async ({ input }) => {
    const note = await noteService.byId(input.id);
    if (!note) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Note ${input.id} not found`,
      });
    }
    return note;
  }),

  create: publicProcedure
    .input(createNoteInput)
    .mutation(({ input }) => noteService.create(input)),

  update: publicProcedure
    .input(updateNoteInput)
    .mutation(({ input }) => noteService.update(input).catch(toTRPCError)),

  remove: publicProcedure
    .input(noteIdInput)
    .mutation(({ input }) => noteService.remove(input.id).catch(toTRPCError)),
});
