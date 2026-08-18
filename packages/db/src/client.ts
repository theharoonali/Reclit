import { createLoggerWithContext } from "@repo/logger";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { withReplicas } from "./replicas";
import * as schema from "./schema";

const logger = createLoggerWithContext("db");

const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

const connectionConfig = {
  max: isDevelopment ? 8 : isProduction ? 40 : 6,
  min: isDevelopment ? 0 : isProduction ? 8 : 1,
  idleTimeoutMillis: isDevelopment ? 5000 : isProduction ? 30000 : 10000,
  connectionTimeoutMillis: 5000,
  maxUses: isDevelopment ? 100 : 7500,
  allowExitOnIdle: !isProduction,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  ssl: isDevelopment ? false : { rejectUnauthorized: false },
};

function getPgErrorDetails(error: unknown) {
  const details: Record<string, unknown> = {};

  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    const fields = [
      "name",
      "message",
      "code",
      "errno",
      "syscall",
      "address",
      "port",
      "stack",
    ];

    for (const field of fields) {
      if (err[field] !== undefined) {
        details[field] = err[field];
      }
    }
  } else {
    details.message = String(error);
  }

  return details;
}

function getSinglePoolStats(pool: Pool) {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

function attachPoolMonitoring(pool: Pool, poolName: "primary" | "replica") {
  pool.on("error", (err) => {
    logger.error(`${poolName} pool: idle client error`, {
      pool: poolName,
      ...getPgErrorDetails(err),
      stats: getSinglePoolStats(pool),
    });
  });
}

// Primary pool — DATABASE_URL
const primaryPool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ...connectionConfig,
});

attachPoolMonitoring(primaryPool, "primary");

export const primaryDb = drizzle(primaryPool, {
  schema,
  casing: "snake_case",
});

// Optional read replica — DATABASE_REPLICA_URL. Falls back to the primary
// pool when unset or identical to the primary URL.
const rawReplicaUrl = process.env.DATABASE_REPLICA_URL;

const replicaUrl =
  rawReplicaUrl && rawReplicaUrl !== process.env.DATABASE_URL
    ? rawReplicaUrl
    : undefined;

const replicaPool = replicaUrl
  ? new Pool({ connectionString: replicaUrl, ...connectionConfig })
  : null;

if (replicaPool) {
  attachPoolMonitoring(replicaPool, "replica");
}

const replicaDb = replicaPool
  ? drizzle(replicaPool, {
      schema,
      casing: "snake_case",
    })
  : primaryDb;

export const db = withReplicas(
  primaryDb,
  [replicaDb],
  (replicas) => replicas[0]!,
);

export const connectDb = async () => {
  return db;
};

export type Database = Awaited<ReturnType<typeof connectDb>>;

export type TransactionClient = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Use in query functions that should work both standalone and within transactions */
export type DatabaseOrTransaction = Database | TransactionClient;

export type DatabaseWithPrimary = Database & {
  $primary?: Database;
  usePrimaryOnly?: () => Database;
};

export function getPoolStats() {
  return {
    primary: {
      total: primaryPool.totalCount,
      idle: primaryPool.idleCount,
      waiting: primaryPool.waitingCount,
    },
    replica: replicaPool
      ? {
          total: replicaPool.totalCount,
          idle: replicaPool.idleCount,
          waiting: replicaPool.waitingCount,
        }
      : null,
  };
}

/**
 * Close all database pools gracefully
 */
export const closeDb = async (): Promise<void> => {
  await Promise.all([primaryPool.end(), replicaPool?.end()]);
};
