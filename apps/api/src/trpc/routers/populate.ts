import { idInput } from "../../common/schema";
import {
  populateSetOutputInput,
  populateSubmitInput,
} from "../../modules/populate/populate.schema";
import { populateService } from "../../modules/populate/populate.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. Nothing here may import @nestjs/*
// (AGENTS.md invariant 2). The REST twin of this surface is
// modules/populate/populate.controller.ts (`form` and `submit`; `setOutput`
// is the admin's switch and has no REST face).

export const populateRouter = createTRPCRouter({
  /** The sheet's name, fillable columns and AI outputs — what a form renders. */
  form: publicProcedure
    .input(idInput)
    .query(({ input }) => populateService.form(input.id).catch(mapDomainError)),

  /** Whether the public form shows a submitted row's AI columns filling in. */
  setOutput: publicProcedure
    .input(populateSetOutputInput)
    .mutation(({ input }) =>
      populateService.setOutput(input).catch(mapDomainError),
    ),

  /** Appends one row by column name, then starts that row's AI columns. */
  submit: publicProcedure
    .input(populateSubmitInput)
    .mutation(({ input }) =>
      populateService.submit(input).catch(mapDomainError),
    ),
});
