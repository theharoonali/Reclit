import { runs, tasks } from "@trigger.dev/sdk";
import { dashboardGenerationControlService } from "../modules/dashboard-generation/dashboard-generation-control.service";
import type { generateDashboardTask } from "../trigger/generate-dashboard";

// The API-side client of the `generate-dashboard` task: trigger and cancel.
// Like assistant-dispatch.ts it lives outside src/trigger/ (bundled into the
// worker) and outside src/modules/** and src/trpc/** (transpiled by the
// dashboard — AGENTS.md invariant 2), and is registered from src/main.ts
// only, so the test suite never reaches the network. The task import is
// type-only.

export function registerDashboardGenerationDispatcher(): void {
  dashboardGenerationControlService.setDispatcher({
    trigger: async (generation) => {
      // One task run per generation: a retried dispatch cannot enqueue it twice.
      const handle = await tasks.trigger<typeof generateDashboardTask>(
        "generate-dashboard",
        { generationId: generation.id },
        {
          idempotencyKey: generation.id,
          tags: [`dashboard-generation:${generation.id}`],
        },
      );
      return { id: handle.id };
    },
    cancel: async (triggerRunId) => {
      await runs.cancel(triggerRunId);
    },
  });
}
