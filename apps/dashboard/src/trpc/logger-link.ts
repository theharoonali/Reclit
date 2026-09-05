import type { AppRouter } from "@reclit/api/trpc/routers/_app";
import { loggerLink } from "@trpc/client";

/**
 * Logs every operation in development and only failures in production.
 * Shared by the browser client and the server proxy so the two never drift.
 */
export const devLoggerLink = () =>
  loggerLink<AppRouter>({
    enabled: (opts) =>
      process.env.NODE_ENV === "development" ||
      (opts.direction === "down" && opts.result instanceof Error),
  });
