import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev v4. Tasks live in src/trigger/ and are bundled by the Trigger
// CLI (which runs under Node: `bun run trigger:dev`), then executed on Bun.
// Nothing under src/trpc/** or src/modules/** may import @trigger.dev/sdk —
// the dashboard transpiles that graph (AGENTS.md invariant 2).
export default defineConfig({
  project: "proj_rjcebnrktkgcqviaukov",
  runtime: "bun",
  dirs: ["./src/trigger"],
  maxDuration: 300,
});
