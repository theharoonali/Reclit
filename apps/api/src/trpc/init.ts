import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import superjson from "superjson";
import type { DomainErrorKind } from "../common/errors";
import { DomainError } from "../common/errors";
import { requestToken, SESSION_COOKIE } from "../modules/auth/auth.request";
import { authService, SESSION_TTL_MS } from "../modules/auth/auth.service";

// This file (and everything under src/trpc/) must stay free of @nestjs/*
// imports — the dashboard transpiles this import graph via @reclit/api.

export { SESSION_COOKIE };

export type TRPCContext = {
  /** True in dev mode (DEV=TRUE) or when the request carried a valid session token. */
  authenticated: boolean;
  devMode: boolean;
  /** Absent on the direct test caller, which has no HTTP response to write to. */
  setSessionCookie?: (token: string) => void;
  clearSessionCookie?: () => void;
};

export const createTRPCContext = (
  opts?: CreateExpressContextOptions,
): TRPCContext => {
  const devMode = authService.devMode();
  const token = opts
    ? requestToken(opts.req.headers, opts.info?.connectionParams?.token)
    : undefined;
  return {
    authenticated: devMode || authService.verify(token),
    devMode,
    setSessionCookie: opts
      ? (value) =>
          opts.res.cookie(SESSION_COOKIE, value, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: SESSION_TTL_MS,
            secure: process.env.NODE_ENV === "production",
          })
      : undefined,
    clearSessionCookie: opts
      ? () =>
          opts.res.clearCookie(SESSION_COOKIE, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
          })
      : undefined,
  };
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  // Subscriptions ride SSE. The ping keeps proxies and load balancers from
  // idling the connection out; a client that hears nothing for longer than
  // `reconnectAfterInactivityMs` reconnects with its last event id. tRPC
  // refuses to start if the ping interval is the longer of the two.
  sse: {
    ping: { enabled: true, intervalMs: 15_000 },
    client: { reconnectAfterInactivityMs: 45_000 },
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** Refuses the call without a session (or DEV=TRUE). The dashboard's gate
 * reads this UNAUTHORIZED and redirects to /login. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authenticated) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
  }
  return next();
});

const KIND_TO_TRPC: Record<DomainErrorKind, TRPCError["code"]> = {
  not_found: "NOT_FOUND",
  bad_request: "BAD_REQUEST",
  unauthorized: "UNAUTHORIZED",
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
