import { runs, tasks, wait } from "@trigger.dev/sdk";
import { assistantControlService } from "../modules/assistant/assistant-control.service";
import type { assistantRunTask } from "../trigger/assistant-run";

// The API-side client of the `assistant-run` task: trigger, cancel, and
// complete the confirmation token. Like run-ai-dispatch.ts it lives outside
// src/trigger/ (bundled into the worker) and outside src/modules/** and
// src/trpc/** (transpiled by the dashboard — AGENTS.md invariant 2), and is
// registered from src/main.ts only, so the test suite never reaches the
// network. The task import is type-only.

export function registerAssistantDispatcher(): void {
  assistantControlService.setDispatcher({
    trigger: async (run) => {
      // One task run per assistant run: a retried dispatch cannot enqueue it twice.
      const handle = await tasks.trigger<typeof assistantRunTask>(
        "assistant-run",
        { runId: run.id },
        { idempotencyKey: run.id, tags: [`assistant:${run.id}`] },
      );
      return { id: handle.id };
    },
    cancel: async (triggerRunId) => {
      await runs.cancel(triggerRunId);
    },
    completeToken: async (tokenId, data) => {
      const result = await wait.completeToken(tokenId, data);
      return { success: result.success };
    },
  });
}
