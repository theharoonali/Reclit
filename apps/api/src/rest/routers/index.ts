import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "../types";
import { exampleRouter } from "./example";

const routers = new OpenAPIHono<Context>();

routers.route("/example", exampleRouter);

export { routers };
