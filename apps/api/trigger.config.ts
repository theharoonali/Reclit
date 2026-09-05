import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev v4 — see ARCHITECTURE.md "Background jobs". The "modern" Prisma
// extension keeps @prisma/client external so the generated Prisma 7 client
// works in the worker (tasks import the services).
export default defineConfig({
  project: "proj_rjcebnrktkgcqviaukov",
  runtime: "bun",
  dirs: ["./src/trigger"],
  maxDuration: 300,
  build: {
    extensions: [prismaExtension({ mode: "modern" })],
  },
});
