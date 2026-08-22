import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

// Framework-free on purpose: src/trpc/** imports the services that import this
// file, and that graph must stay free of @nestjs/* (see AGENTS.md invariant 2).

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

/** Cheap liveness probe used by GET /health. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
