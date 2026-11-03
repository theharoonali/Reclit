import { logger, schemaTask, wait } from "@trigger.dev/sdk";
import { describeError } from "../common/errors";
import { DashboardGenerationFinishedError } from "../modules/dashboard-generation/dashboard-generation.errors";
import {
  type DashboardGeneration,
  generationJobPayloadSchema,
  isTerminalGenerationStatus,
  MAX_WAIT_POLLS,
  WAIT_FOR_ROWS_SECONDS,
} from "../modules/dashboard-generation/dashboard-generation.schema";
import { dashboardGenerationService } from "../modules/dashboard-generation/dashboard-generation.service";
import {
  dashboardGenerationPipelineService,
  pipelineGenerators,
} from "../modules/dashboard-generation/dashboard-generation-pipeline.service";
import { isTerminalRunAiStatus } from "../modules/run-ai/run-ai.schema";
import { runAiService } from "../modules/run-ai/run-ai.service";

// One dashboard generation, end to end: wait for the onboarding run-ai batch
// (when there is one) so the AI columns hold values, then the pipeline —
// analyze, propose, pack, verify, review, one retry with the mistakes fed
// back, apply — with every phase written to the row (and so streamed to the
// page). No retries: every transition is guarded, a `cancelled` row ends the
// run quietly, and `onFailure` covers the crash paths the catch cannot see.

export type GenerateDashboardOutcome = { generationId: string; status: string };

/** Throws `DashboardGenerationFinishedError` when the row went terminal under us (a cancel). */
async function assertStillRunning(generationId: string): Promise<void> {
  const current = await dashboardGenerationService.byId(generationId);
  if (isTerminalGenerationStatus(current.status)) {
    throw new DashboardGenerationFinishedError(generationId);
  }
}

/**
 * Sleeps (checkpointed, so free) until every run of the batch is terminal or
 * the polls run out — then the sheet is analyzed as it is, partially filled.
 */
async function waitForBatch(
  generation: DashboardGeneration,
  batchId: string,
): Promise<void> {
  const runs = await runAiService.listByBatch(batchId);
  await dashboardGenerationService.markRunning(
    generation.id,
    "waiting_for_rows",
    0,
    `${runs.length} cells`,
  );
  for (let poll = 0; poll < MAX_WAIT_POLLS; poll++) {
    const current = await runAiService.listByBatch(batchId);
    if (current.every((run) => isTerminalRunAiStatus(run.status))) return;
    await assertStillRunning(generation.id);
    await wait.for({ seconds: WAIT_FOR_ROWS_SECONDS });
  }
  logger.warn("run-ai batch still working, proceeding with the filled rows", {
    generationId: generation.id,
    batchId,
  });
}

export const generateDashboardTask = schemaTask({
  id: "generate-dashboard",
  schema: generationJobPayloadSchema,
  maxDuration: 900,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 3 },
  run: async ({ generationId }): Promise<GenerateDashboardOutcome> => {
    const generation = await dashboardGenerationService.byId(generationId);
    if (isTerminalGenerationStatus(generation.status)) {
      logger.warn("dashboard generation already finished, nothing to do", {
        generationId,
        status: generation.status,
      });
      return { generationId, status: generation.status };
    }
    try {
      await dashboardGenerationService.markRunning(generationId, "queued", 0);
      if (generation.awaitBatchId) {
        await waitForBatch(generation, generation.awaitBatchId);
      }
      const outcome = await dashboardGenerationPipelineService.run(
        {
          workspaceId: generation.workspaceId,
          spreadsheetId: generation.spreadsheetId,
        },
        {
          ...pipelineGenerators,
          onPhase: (phase, attempt, detail) =>
            dashboardGenerationService.markRunning(
              generationId,
              phase,
              attempt,
              detail,
            ),
          assertAlive: () => assertStillRunning(generationId),
          setBrief: (brief) =>
            dashboardGenerationService.setBrief(generationId, brief),
        },
      );
      await dashboardGenerationService.complete(generationId, outcome);
      logger.info("dashboard generated", {
        generationId,
        ...outcome.result,
      });
      return { generationId, status: "completed" };
    } catch (error) {
      if (error instanceof DashboardGenerationFinishedError) {
        logger.info("dashboard generation was cancelled", { generationId });
        return { generationId, status: "cancelled" };
      }
      const failure = describeError(error);
      logger.error("dashboard generation failed", { generationId, ...failure });
      await dashboardGenerationService
        .fail(generationId, failure)
        .catch(() => {});
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    // Idempotent on a generation the catch above already failed; a no-op on a
    // cancelled one (the guarded write refuses to revive it).
    await dashboardGenerationService
      .fail(payload.generationId, describeError(error))
      .catch(() => {});
  },
});
