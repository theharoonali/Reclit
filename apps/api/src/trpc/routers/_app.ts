import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { assistantRouter } from "./assistant";
import { dashboardRouter } from "./dashboard";
import { externalApiRouter } from "./external-api";
import { onboardingRouter } from "./onboarding";
import { populateRouter } from "./populate";
import { runAiRouter } from "./run-ai";
import { spreadsheetRouter } from "./spreadsheet";
import { userRouter } from "./user";
import { workspaceRouter } from "./workspace";

export const appRouter = createTRPCRouter({
  assistant: assistantRouter,
  dashboard: dashboardRouter,
  externalApi: externalApiRouter,
  onboarding: onboardingRouter,
  populate: populateRouter,
  runAi: runAiRouter,
  spreadsheet: spreadsheetRouter,
  user: userRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
