import { initTRPC } from "@trpc/server";
import superjson from "superjson";

// This file (and everything under src/trpc/) must stay free of @nestjs/*
// imports — the dashboard transpiles this import graph via @repo/api.
export type TRPCContext = Record<string, never>;

export const createTRPCContext = (): TRPCContext => ({});

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;
