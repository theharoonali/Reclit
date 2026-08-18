import { trpcServer } from "@hono/trpc-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { closeDb, getPoolStats } from "@repo/db/client";
import {
  buildDependenciesResponse,
  buildReadinessResponse,
  checkDependencies,
} from "@repo/health/checker";
import { apiDependencies } from "@repo/health/probes";
import { logger } from "@repo/logger";
import { Scalar } from "@scalar/hono-api-reference";

import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { routers } from "./rest/routers";
import type { Context } from "./rest/types";
import { createTRPCContext } from "./trpc/init";
import { appRouter } from "./trpc/routers/_app";
import { httpLogger } from "./utils/logger";

const app = new OpenAPIHono<Context>();

app.use(httpLogger());
app.use(
  secureHeaders({
    crossOriginResourcePolicy: "cross-origin",
  }),
);

app.use(
  "*",
  cors({
    origin: process.env.ALLOWED_API_ORIGINS?.split(",") ?? [],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "User-Agent",
      "accept-language",
      "x-request-id",
      "trpc-accept",
      "x-trpc-source",
      "x-user-locale",
      "x-user-timezone",
      "x-user-country",
      "x-force-primary",
    ],
    exposeHeaders: [
      "Content-Length",
      "Content-Type",
      "Cache-Control",
      "Cross-Origin-Resource-Policy",
      "Server-Timing",
    ],
    maxAge: 86400,
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: createTRPCContext,
    onError: ({ error, path }) => {
      logger.error(`[tRPC] ${path}`, {
        message: error.message,
        code: error.code,
        cause: error.cause instanceof Error ? error.cause.message : undefined,
        stack: error.stack,
      });
    },
  }),
);

app.get("/favicon.ico", (c) => c.body(null, 204));
app.get("/robots.txt", (c) => c.body(null, 204));

app.get("/health", (c) => {
  c.header("X-Server-Timestamp", Date.now().toString());
  return c.json({ status: "ok" }, 200);
});

app.get("/health/ready", async (c) => {
  const results = await checkDependencies(apiDependencies(), 1);
  const response = buildReadinessResponse(results);
  return c.json(response, response.status === "ok" ? 200 : 503);
});

app.get("/health/dependencies", async (c) => {
  const results = await checkDependencies(apiDependencies());
  const response = buildDependenciesResponse(results);
  return c.json(response, response.status === "ok" ? 200 : 503);
});

const openAPIConfig = {
  openapi: "3.1.0",
  info: {
    version: "0.0.1",
    title: "API",
    description: "API for the app.",
  },
  servers: [
    {
      url: process.env.API_URL || "http://localhost:3003",
      description: "API",
    },
  ],
  security: [{ token: [] }] as Record<string, string[]>[],
  tags: [{ name: "Example", description: "Example endpoints" }],
};

app.get("/openapi", (c) => {
  return c.json(app.getOpenAPI31Document(openAPIConfig));
});

// Register security schemes
app.openAPIRegistry.registerComponent("securitySchemes", "token", {
  type: "http",
  scheme: "bearer",
  description: "Default authentication mechanism",
});

app.get("/", Scalar({ url: "/openapi", pageTitle: "API", theme: "saturn" }));

app.route("/", routers);

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  logger.error(`[Hono] ${c.req.method} ${c.req.path}`, {
    message: err.message,
    stack: err.stack,
  });
  return c.json({ error: "Internal Server Error" }, 500);
});

/**
 * Graceful shutdown handlers
 * Close database connections cleanly on process termination
 */
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  const SHUTDOWN_TIMEOUT = 12_000;

  const shutdownPromise = (async () => {
    try {
      logger.info("Closing database connections...", {
        pool: getPoolStats(),
      });
      await closeDb();

      logger.info("Graceful shutdown complete");
    } catch (error) {
      logger.error("Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      logger.warn("Shutdown timeout reached, forcing exit");
      resolve();
    }, SHUTDOWN_TIMEOUT);
  });

  await Promise.race([shutdownPromise, timeoutPromise]);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

export default {
  port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000,
  fetch: app.fetch,
  host: "0.0.0.0", // Listen on all interfaces
  idleTimeout: 60,
};
