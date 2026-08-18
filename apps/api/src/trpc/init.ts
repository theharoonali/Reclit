import { createClient } from "@api/services/supabase";
import type { Session } from "@api/utils/auth";
import { verifyAccessToken } from "@api/utils/auth";
import { getGeoContext } from "@api/utils/geo";
import { getRequestTrace } from "@api/utils/request-trace";
import { safeCompare } from "@api/utils/safe-compare";
import type { Database } from "@repo/db/client";
import { db } from "@repo/db/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "hono";
import superjson from "superjson";
import { withPrimaryReadAfterWrite } from "./middleware/primary-read-after-write";

type TRPCContext = {
  session: Session | null;
  supabase: SupabaseClient;
  db: Database;
  geo: ReturnType<typeof getGeoContext>;
  forcePrimary?: boolean;
  isInternalRequest?: boolean;
  requestId: string;
  cfRay?: string;
};

export const createTRPCContext = async (
  _: unknown,
  c: Context,
): Promise<TRPCContext> => {
  const accessToken = c.req.header("Authorization")?.split(" ")[1];
  const internalKey = c.req.header("x-internal-key");
  const { requestId, cfRay } = getRequestTrace(c.req);

  const isInternalRequest =
    !!internalKey &&
    !!process.env.INTERNAL_API_KEY &&
    safeCompare(internalKey, process.env.INTERNAL_API_KEY);

  const session = await verifyAccessToken(accessToken);
  const supabase = await createClient(accessToken);

  const geo = getGeoContext(c.req);
  const forcePrimary = c.req.header("x-force-primary") === "true";

  return {
    session,
    supabase,
    db,
    geo,
    forcePrimary,
    isInternalRequest,
    requestId,
    cfRay,
  };
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

const withPrimaryDbMiddleware = t.middleware(async (opts) => {
  return withPrimaryReadAfterWrite({
    ctx: opts.ctx,
    type: opts.type,
    next: opts.next,
  });
});

export const publicProcedure = t.procedure.use(withPrimaryDbMiddleware);

export const protectedProcedure = t.procedure
  .use(withPrimaryDbMiddleware)
  .use(async (opts) => {
    const { session } = opts.ctx;

    if (!session) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return opts.next({
      ctx: {
        session,
      },
    });
  });

/**
 * Internal procedure for service-to-service calls ONLY.
 * Authenticates exclusively via x-internal-key header (INTERNAL_API_KEY).
 * Regular user sessions are NOT accepted — use protectedProcedure for browser-facing endpoints.
 */
export const internalProcedure = t.procedure
  .use(withPrimaryDbMiddleware)
  .use(async (opts) => {
    const { isInternalRequest } = opts.ctx;

    if (!isInternalRequest) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return opts.next({
      ctx: opts.ctx,
    });
  });
