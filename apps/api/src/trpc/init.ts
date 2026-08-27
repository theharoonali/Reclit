import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { DomainErrorKind } from "../common/errors";
import { DomainError } from "../common/errors";

// This file (and everything under src/trpc/) must stay free of @nestjs/*
// imports — the dashboard transpiles this import graph via @reclit/api.
export type TRPCContext = Record<string, never>;

export const createTRPCContext = (): TRPCContext => ({});

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

const KIND_TO_TRPC: Record<DomainErrorKind, TRPCError["code"]> = {
  not_found: "NOT_FOUND",
  bad_request: "BAD_REQUEST",
  conflict: "CONFLICT",
  unavailable: "SERVICE_UNAVAILABLE",
  upstream: "BAD_GATEWAY",
};

/**
 * The one domain-error → TRPCError mapping (docs/rules/BACKEND.md "No
 * repetition"). Routers `.catch(mapDomainError)` instead of writing
 * per-procedure try/catch. The REST twin is `common/domain-error.filter.ts`.
 */
export function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw new TRPCError({
      code: KIND_TO_TRPC[error.kind],
      message: error.message,
    });
  }
  throw error;
}
