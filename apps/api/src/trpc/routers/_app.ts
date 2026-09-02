import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { runAiRouter } from "./run-ai";
import { spreadsheetRouter } from "./spreadsheet";
import { userRouter } from "./user";
import { workspaceRouter } from "./workspace";

export const appRouter = createTRPCRouter({
  runAi: runAiRouter,
  spreadsheet: spreadsheetRouter,
  user: userRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
