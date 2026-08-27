import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { noteRouter } from "./note";
import { spreadsheetRouter } from "./spreadsheet";

export const appRouter = createTRPCRouter({
  note: noteRouter,
  spreadsheet: spreadsheetRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
