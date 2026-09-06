import { tasks } from "@trigger.dev/sdk";
import { runAiBatchService } from "../modules/run-ai/run-ai-batch.service";
import type { runAiBatchTask } from "../trigger/run-ai-batch";

// The API-side client of the Trigger.dev tasks: the only place that calls
// `tasks.trigger`. It lives outside src/trigger/ (which the Trigger CLI
// bundles into the worker) and outside src/modules/** and src/trpc/** (which
// the dashboard transpiles — AGENTS.md invariant 2), and is registered from
// src/main.ts only, so the test suite's tRPC caller never reaches the
// network: without a dispatcher the runs simply stay `pending`. The task
// import is type-only, so the API process never evaluates the task module.

export function registerRunAiDispatcher(): void {
  runAiBatchService.setDispatcher(async (batch) => {
    // One orchestrator run per Run click, keyed by the batch id: a retried
    // dispatch cannot enqueue the batch twice.
    await tasks.trigger<typeof runAiBatchTask>("run-ai-batch", batch, {
      idempotencyKey: batch.batchId,
    });
  });
}
