import { logger, schemaTask } from "@trigger.dev/sdk";
import { generateCellValue } from "../ai/cell-output";
import { describeError } from "../common/errors";
import {
  isTerminalRunAiStatus,
  runAiJobPayloadSchema,
} from "../modules/run-ai/run-ai.schema";
import { runAiService } from "../modules/run-ai/run-ai.service";

// One AI cell, end to end — the unit of work `run-ai-batch` fans out. The
// orchestrator has already recorded `result.input` on the `pending` run; this
// task moves it `running`, asks the model, and `complete`s it (the service
// writes `result.output` into the cell before flipping the status) or
// `fail`s it with the reason. Every transition fires the Postgres trigger, so
// the sheet sees it live. The return value is what the orchestrator reads to
// decide whether the row's series goes on.
//
// No retries: a `failed` run is terminal and must not be revived. A run the
// API already failed (a dispatch that timed out after the job was accepted)
// is left alone, and `onFailure` covers the crash paths the catch cannot
// reach — a maxDuration kill would otherwise leave the cell busy for good.

export type RunAiCellOutcome = { runId: string; status: string };

export const runAiCellTask = schemaTask({
  id: "run-ai-cell",
  schema: runAiJobPayloadSchema,
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async ({ runId, input }): Promise<RunAiCellOutcome> => {
    const run = await runAiService.byId(runId);
    if (isTerminalRunAiStatus(run.status)) {
      logger.warn("run already finished, nothing to do", {
        runId,
        status: run.status,
      });
      return { runId, status: run.status };
    }
    await runAiService.markRunning(runId);
    try {
      const { output, model, usage, attachments } =
        await generateCellValue(input);
      logger.info("cell generated", { runId, model, usage, attachments });
      const completed = await runAiService.complete(runId, {
        result: { input, output, model, usage, attachments },
      });
      return { runId, status: completed.status };
    } catch (error) {
      const failure = describeError(error);
      logger.error("cell generation failed", { runId, ...failure });
      await runAiService.fail(runId, { result: { input, error: failure } });
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    // Idempotent on a run the catch above already failed.
    await runAiService
      .fail(payload.runId, {
        result: { input: payload.input, error: describeError(error) },
      })
      .catch(() => {});
  },
});
