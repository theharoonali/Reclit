import { tasks } from "@trigger.dev/sdk";
import { runAiService } from "../modules/run-ai/run-ai.service";
import type { runAiCellTask } from "../trigger/run-ai-cell";

// The API-side client of the Trigger.dev tasks: the only place that calls
// `tasks.trigger`. It lives outside src/trigger/ (which the Trigger CLI
// bundles into the worker) and outside src/modules/** and src/trpc/** (which
// the dashboard transpiles — AGENTS.md invariant 2), and is registered from
// src/main.ts only, so the test suite's tRPC caller never reaches the
// network: without a dispatcher a run simply stays `pending`. The task import
// is type-only, so the API process never evaluates the task module.

export function registerRunAiDispatcher(): void {
  runAiService.setDispatcher(async (payload) => {
    // Keyed by the run id: a retried dispatch cannot enqueue the job twice.
    await tasks.trigger<typeof runAiCellTask>("run-ai-cell", payload, {
      idempotencyKey: payload.runId,
    });
  });
}
