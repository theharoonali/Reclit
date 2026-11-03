import "reflect-metadata";
import type { ServerResponse } from "node:http";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { AppModule } from "./app.module";
import { DomainErrorFilter } from "./common/domain-error.filter";
import { createTRPCContext } from "./trpc/init";
import { appRouter } from "./trpc/routers/_app";

export async function createApp(opts?: { logger?: false }) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: opts?.logger ?? ["error", "warn", "log"],
  });

  app.enableCors({
    origin: process.env.ALLOWED_API_ORIGINS?.split(",") ?? [
      "http://localhost:4000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "x-trpc-source",
      "trpc-accept",
      // Sent by the browser's own EventSource reconnect (tRPC subscriptions).
      "Last-Event-ID",
    ],
    exposedHeaders: ["Content-Length", "Content-Type", "Cache-Control"],
    // The session rides an httpOnly cookie; :4000 → :4001 is cross-origin.
    credentials: true,
    maxAge: 86400,
  });

  // REST half of the shared domain-error mapping (tRPC's is mapDomainError).
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest's useGlobalFilters is not a React hook.
  app.useGlobalFilters(new DomainErrorFilter());

  // tRPC's streamed responses (httpBatchStreamLink, SSE) set
  // `Transfer-Encoding: chunked` themselves, and Bun's node:http adds its own
  // when it chunks a body without a length: the response then carries the
  // header twice, which nginx refuses as a 502 (browsers let it pass, so it
  // only shows behind a proxy). Bun owns the framing; drop tRPC's copy.
  app.use("/trpc", (_req: unknown, res: ServerResponse, next: () => void) => {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) =>
      name.toLowerCase() === "transfer-encoding" ? res : setHeader(name, value);
    next();
  });

  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: createTRPCContext,
    }),
  );

  return app;
}
