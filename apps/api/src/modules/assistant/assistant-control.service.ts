import { describeError } from "../../common/errors";
import { SpreadsheetNotFoundError } from "../spreadsheet/spreadsheet.errors";
import { workspaceService } from "../workspace/workspace.service";
import {
  AssistantDispatchError,
  AssistantNotAwaitingError,
} from "./assistant.errors";
import type {
  AssistantRun,
  AssistantSourceWire,
  RespondAssistantInput,
  StartAssistantInput,
} from "./assistant.schema";
import { assistantService } from "./assistant.service";

// Framework-free and prisma-free (docs/rules/BACKEND.md hard rule 1). The
// three calls that reach the Trigger.dev worker — start, cancel, respond —
// through a hook: `src/modules/**` may not import `@trigger.dev/sdk`, so
// `src/jobs/assistant-dispatch.ts` registers the client from `src/main.ts`.
// Without a dispatcher (tests, an api started without TRIGGER_SECRET_KEY) a
// run stays `pending`, a cancel still flips the row, and a response is
// recorded but wakes nobody. The `run-ai` dispatcher hook is the precedent.

export type AssistantDispatcher = {
  /** Enqueues the `assistant-run` task; answers the Trigger.dev run id. */
  trigger(run: { id: string }): Promise<{ id: string }>;
  /** Stops the task run — queued, running or suspended on a token. */
  cancel(triggerRunId: string): Promise<void>;
  /** Wakes a task suspended on a waitpoint token with the user's answer. */
  completeToken(
    tokenId: string,
    data: { approved: boolean },
  ): Promise<{ success: boolean }>;
};

export type StartAssistantServiceInput = StartAssistantInput & {
  /** Defaults to `user`; onboarding and jobs pass `system`. */
  source?: AssistantSourceWire;
};

export class AssistantControlService {
  private dispatcher: AssistantDispatcher | null = null;

  setDispatcher(dispatcher: AssistantDispatcher | null): void {
    this.dispatcher = dispatcher;
  }

  /**
   * Records the run `pending`, then asks the worker. The insert comes first so
   * its trigger reaches the capsule before the worker is asked; a dispatch
   * that throws fails the row and surfaces as `ASSISTANT_DISPATCH_FAILED`.
   * Callable in-process (onboarding) exactly like from the router.
   */
  async start(input: StartAssistantServiceInput): Promise<AssistantRun> {
    const workspace = await workspaceService.byId(input.workspaceId);
    if (workspace.spreadsheetId === null) {
      throw new SpreadsheetNotFoundError(`of workspace ${input.workspaceId}`);
    }
    const run = await assistantService.create({
      workspaceId: input.workspaceId,
      spreadsheetId: workspace.spreadsheetId,
      scope: input.scope,
      source: input.source ?? "user",
      prompt: input.prompt,
    });
    if (this.dispatcher === null) return run;

    let handle: { id: string };
    try {
      handle = await this.dispatcher.trigger({ id: run.id });
      await assistantService.setTriggerRunId(run.id, handle.id);
    } catch (error) {
      const failure = describeError(error);
      await assistantService.fail(run.id, failure).catch(() => {});
      throw new AssistantDispatchError(run.id, failure.message);
    }
    // A cancel that landed between the insert and the handle found nothing
    // to stop; the task itself exits on a cancelled row, but stop it early.
    const latest = await assistantService.byId(run.id);
    if (latest.status === "cancelled") await this.stopWorker(handle.id);
    return latest;
  }

  /**
   * The row is the truth: it is cancelled first and the worker told second,
   * best effort. The task re-reads the row between steps and exits on a
   * cancelled one even if the Trigger.dev cancel never arrives.
   */
  async cancel(id: string): Promise<AssistantRun> {
    const info = await assistantService.controlInfo(id);
    const run = await assistantService.cancel(id);
    if (info.triggerRunId) await this.stopWorker(info.triggerRunId);
    return run;
  }

  /**
   * Answers the pending confirmation: recorded on the row, then the token is
   * completed so the suspended task resumes. The status stays
   * `awaiting_confirmation` until the worker writes the step's outcome.
   */
  async respond(input: RespondAssistantInput): Promise<AssistantRun> {
    const info = await assistantService.controlInfo(input.id);
    const action = info.pendingAction;
    if (info.status !== "awaiting_confirmation" || !action || action.response) {
      throw new AssistantNotAwaitingError(input.id);
    }
    const run = await assistantService.recordResponse(input.id, input.approved);
    if (this.dispatcher === null) return run;
    try {
      const result = await this.dispatcher.completeToken(action.tokenId, {
        approved: input.approved,
      });
      if (!result.success) throw new Error("the token was not completed");
    } catch (error) {
      // The token timed out or was already completed: the worker will (or
      // did) move on without this answer.
      throw new AssistantNotAwaitingError(
        input.id,
        describeError(error).message,
      );
    }
    return run;
  }

  private async stopWorker(triggerRunId: string): Promise<void> {
    if (this.dispatcher === null) return;
    await this.dispatcher.cancel(triggerRunId).catch((error: unknown) => {
      console.error(
        "[assistant] could not cancel the worker run:",
        describeError(error).message,
      );
    });
  }
}

export const assistantControlService = new AssistantControlService();
