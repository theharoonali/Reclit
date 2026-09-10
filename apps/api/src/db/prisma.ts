import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "../../generated/prisma/client";
import {
  PrismaClient,
  Prisma as PrismaNamespace,
} from "../../generated/prisma/client";

// The ONLY Prisma client. Framework-free (docs/rules/BACKEND.md hard rule 1);
// the Nest shutdown hook lives in prisma.module.ts.

function logLevels(): ("error" | "warn")[] {
  if (process.env.NODE_ENV === "test") return [];
  if (process.env.NODE_ENV === "production") return ["error"];
  return ["error", "warn"];
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Quiet in tests: expected P2025 misses would otherwise print as errors.
    log: logLevels(),
  });
}

// `bun --watch` re-evaluates modules on reload; cache on globalThis so we don't
// leak a connection pool per reload.
const globalForPrisma = globalThis as unknown as {
  __prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  globalForPrisma.__prisma = undefined;
}

/**
 * A validated wire value as a Prisma JSON write. Zod cannot express
 * `Prisma.InputJsonValue` exactly; the runtime shapes match.
 */
export const toJsonInput = (value: unknown): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

/**
 * The same for a **nullable** JSON column, where a bare `null` is ambiguous:
 * Prisma needs `DbNull` to mean SQL NULL (`JsonNull` would store the JSON
 * value `null`). Clearing such a column always goes through here.
 */
export const toNullableJsonInput = (
  value: unknown,
): Prisma.InputJsonValue | typeof PrismaNamespace.DbNull =>
  value === null || value === undefined
    ? PrismaNamespace.DbNull
    : (value as Prisma.InputJsonValue);

/** Cheap liveness probe used by GET /health. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
