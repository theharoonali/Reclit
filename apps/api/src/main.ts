import { createApp } from "./bootstrap";

const app = await createApp();

// Signal-driven shutdown (SIGINT/SIGTERM) — runs provider onApplicationShutdown
// hooks, which is how the Postgres pool gets closed. See src/db/prisma.module.ts.
app.enableShutdownHooks();
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3003;
await app.listen(port, "0.0.0.0");
