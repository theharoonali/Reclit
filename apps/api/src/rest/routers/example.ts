import type { Context } from "@api/rest/types";
import { helloQuerySchema, helloResponseSchema } from "@api/schemas/example";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

const app = new OpenAPIHono<Context>();

app.openapi(
  createRoute({
    method: "get",
    path: "/hello",
    summary: "Say hello",
    operationId: "getHello",
    "x-speakeasy-name-override": "hello",
    description: "Public example endpoint that returns a greeting.",
    tags: ["Example"],
    request: {
      query: helloQuerySchema,
    },
    responses: {
      200: {
        description: "Greeting response",
        content: {
          "application/json": {
            schema: helloResponseSchema,
          },
        },
      },
    },
  }),
  (c) => {
    const { name } = c.req.valid("query");

    return c.json(
      {
        greeting: `Hello, ${name ?? "world"}!`,
        timestamp: new Date().toISOString(),
      },
      200,
    );
  },
);

export const exampleRouter = app;
