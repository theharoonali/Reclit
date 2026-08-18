import type { Session } from "@api/utils/auth";
import type { Database, DatabaseWithPrimary } from "@repo/db/client";

/**
 * Routes queries to the primary database when the client asks for
 * read-after-write consistency via the `x-force-primary` header, and
 * always routes mutations to the primary.
 *
 * The original implementation also tracked recent writes per team in
 * Redis and pinned subsequent reads to the primary for a replication
 * window. Re-introduce that if/when you add read replicas under load.
 */
export const withPrimaryReadAfterWrite = async <TReturn>(opts: {
  ctx: {
    session?: Session | null;
    db: Database;
    forcePrimary?: boolean;
  };
  type: "query" | "mutation" | "subscription";
  next: (opts: {
    ctx: {
      session?: Session | null;
      db: Database;
      forcePrimary?: boolean;
    };
  }) => Promise<TReturn>;
}) => {
  const { ctx, type, next } = opts;

  if (ctx.forcePrimary || type === "mutation") {
    const dbWithPrimary = ctx.db as DatabaseWithPrimary;
    const primaryOnly = dbWithPrimary.usePrimaryOnly;
    if (primaryOnly) {
      ctx.db = primaryOnly();
    }
  }

  return next({ ctx });
};
