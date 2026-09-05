import { createApp } from "./bootstrap";
import { registerRunAiDispatcher } from "./jobs/run-ai-dispatch";

const app = await createApp();

// The running server is the only process that enqueues Trigger.dev jobs;
// `createApp` alone (tests) leaves runs pending. See src/jobs/run-ai-dispatch.ts.
registerRunAiDispatcher();

// Signal-driven shutdown (SIGINT/SIGTERM) — runs provider onApplicationShutdown
// hooks, which is how the Postgres pool gets closed. See src/db/prisma.module.ts.
app.enableShutdownHooks();
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 4001;
await app.listen(port, "0.0.0.0");
