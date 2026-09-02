import "reflect-metadata";
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
    maxAge: 86400,
  });

  // REST half of the shared domain-error mapping (tRPC's is mapDomainError).
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest's useGlobalFilters is not a React hook.
  app.useGlobalFilters(new DomainErrorFilter());

  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: createTRPCContext,
    }),
  );

  return app;
}
