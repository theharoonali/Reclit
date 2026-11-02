import { describeError } from "../../common/errors";
import { SpreadsheetNotFoundError } from "../spreadsheet/spreadsheet.errors";
import { workspaceService } from "../workspace/workspace.service";
import {
  DashboardGenerationDispatchError,
  DashboardGenerationUnavailableError,
} from "./dashboard-generation.errors";
import type {
  DashboardGeneration,
  StartGenerationInput,
} from "./dashboard-generation.schema";
import { dashboardGenerationService } from "./dashboard-generation.service";

// Framework-free and prisma-free (docs/rules/BACKEND.md hard rule 1). The two
// calls that reach the Trigger.dev worker — start and cancel — through a hook:
// `src/modules/**` may not import `@trigger.dev/sdk`, so
// `src/jobs/dashboard-generation-dispatch.ts` registers the client from
// `src/main.ts`. Without a dispatcher (tests, an api started without
// TRIGGER_SECRET_KEY) a generation stays `pending` and a cancel still flips
// the row. The assistant's control service is the precedent.

export type GenerationDispatcher = {
  /** Enqueues the `generate-dashboard` task; answers the Trigger.dev run id. */
  trigger(generation: { id: string }): Promise<{ id: string }>;
  /** Stops the task run — queued, running or sleeping between looks at the batch. */
  cancel(triggerRunId: string): Promise<void>;
};

export type StartGenerationServiceInput = StartGenerationInput & {
  /** The onboarding run-ai batch the task waits for before analyzing; omitted from the dashboard. */
  awaitBatchId?: string | null;
};

export class DashboardGenerationControlService {
  private dispatcher: GenerationDispatcher | null = null;

  setDispatcher(dispatcher: GenerationDispatcher | null): void {
    this.dispatcher = dispatcher;
  }

  /**
   * Records the generation `pending`, then asks the worker. The insert comes
   * first so its trigger reaches the page before the worker is asked; a
   * dispatch that throws fails the row and surfaces as
   * `DASHBOARD_GENERATION_DISPATCH_FAILED`. The key is checked here because
   * `gemini()` in the worker would only throw a plain Error later.
   */
  async start(
    input: StartGenerationServiceInput,
  ): Promise<DashboardGeneration> {
    const workspace = await workspaceService.byId(input.workspaceId);
    if (workspace.spreadsheetId === null) {
      throw new SpreadsheetNotFoundError(`of workspace ${input.workspaceId}`);
    }
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new DashboardGenerationUnavailableError();
    }
    const generation = await dashboardGenerationService.create({
      workspaceId: input.workspaceId,
      spreadsheetId: workspace.spreadsheetId,
      source: input.source,
      awaitBatchId: input.awaitBatchId ?? null,
    });
    if (this.dispatcher === null) return generation;

    let handle: { id: string };
    try {
      handle = await this.dispatcher.trigger({ id: generation.id });
      await dashboardGenerationService.setTriggerRunId(
        generation.id,
        handle.id,
      );
    } catch (error) {
      const failure = describeError(error);
      await dashboardGenerationService
        .fail(generation.id, failure)
        .catch(() => {});
      throw new DashboardGenerationDispatchError(
        generation.id,
        failure.message,
      );
    }
    // A cancel that landed between the insert and the handle found nothing
    // to stop; the task itself exits on a cancelled row, but stop it early.
    const latest = await dashboardGenerationService.byId(generation.id);
    if (latest.status === "cancelled") await this.stopWorker(handle.id);
    return latest;
  }

  /**
   * The row is the truth: it is cancelled first and the worker told second,
   * best effort. The task re-reads the row between phases and exits on a
   * cancelled one even if the Trigger.dev cancel never arrives.
   */
  async cancel(id: string): Promise<DashboardGeneration> {
    const info = await dashboardGenerationService.controlInfo(id);
    const generation = await dashboardGenerationService.cancel(id);
    if (info.triggerRunId) await this.stopWorker(info.triggerRunId);
    return generation;
  }

  private async stopWorker(triggerRunId: string): Promise<void> {
    if (this.dispatcher === null) return;
    await this.dispatcher.cancel(triggerRunId).catch((error: unknown) => {
      console.error(
        "[dashboard-generation] could not cancel the worker run:",
        describeError(error).message,
      );
    });
  }
}

export const dashboardGenerationControlService =
  new DashboardGenerationControlService();
