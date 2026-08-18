import { z } from "@hono/zod-openapi";

export const helloResponseSchema = z
  .object({
    greeting: z.string().openapi({
      description: "Greeting message",
      example: "Hello, world!",
    }),
    timestamp: z.string().openapi({
      description: "ISO timestamp of the response",
      example: "2026-01-01T00:00:00.000Z",
    }),
  })
  .openapi("HelloResponse");

export const helloQuerySchema = z.object({
  name: z
    .string()
    .optional()
    .openapi({
      description: "Name to greet",
      example: "Ada",
      param: { in: "query", name: "name" },
    }),
});
