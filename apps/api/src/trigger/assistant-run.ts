import { logger, schemaTask, wait } from "@trigger.dev/sdk";
import type { ModelMessage } from "ai";
import { buildAssistantSystemPrompt } from "../ai/assistant-prompt";
import {
  addUsage,
  runAssistantStep,
  toolResultsMessage,
  toToolSet,
  trimTranscript,
} from "../ai/assistant-step";
import { describeError } from "../common/errors";
import { AssistantFinishedError } from "../modules/assistant/assistant.errors";
import {
  ASSISTANT_CONFIRMATION_TIMEOUT,
  type AssistantRun,
  type AssistantStep,
  type AssistantUsage,
  assistantJobPayloadSchema,
  assistantToolName,
  isTerminalAssistantStatus,
  MAX_ASSISTANT_STEPS,
  MAX_ASSISTANT_TOOL_CALLS,
} from "../modules/assistant/assistant.schema";
import { assistantService } from "../modules/assistant/assistant.service";
import {
  loadAssistantContext,
  toPromptContext,
} from "../modules/assistant/assistant-context";
import {
  AssistantConfirmationTimeoutError,
  AssistantExecutor,
  type ConfirmationOutcome,
  type ExecutorDeps,
  toolSpecsForScope,
} from "../modules/assistant/assistant-executor";
import { summariseStepInput } from "../modules/assistant/assistant-tools";

// One assistant run, end to end: the prompt becomes a conversation the model
// advances one step at a time — a text answer finishes the run, tool calls
// are executed one by one through the services with every transition written
// to the row (and so streamed to the capsule) — until the model answers, the
// step cap is hit, the user cancels, or a delete goes unconfirmed.
//
// A delete suspends the run on a Trigger.dev waitpoint token (free while it
// waits; `maxDuration` counts compute only). `assistant.respond` completes the
// token from the api; a timeout cancels the run. No retries: every transition
// is guarded, a `cancelled` row ends the run quietly, and `onFailure` covers
// the crash paths the catch cannot see (a maxDuration kill).

export type AssistantRunOutcome = { runId: string; status: string };

const nowIso = () => new Date().toISOString();

const EMPTY_USAGE: AssistantUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

/** Throws `AssistantFinishedError` when the row went terminal under us (a cancel). */
async function assertStillRunning(runId: string): Promise<void> {
  const current = await assistantService.byId(runId);
  if (isTerminalAssistantStatus(current.status)) {
    throw new AssistantFinishedError(runId);
  }
}

/** Pauses on a waitpoint token until `assistant.respond` completes it, or it times out. */
const confirmWithUser =
  (runId: string): ExecutorDeps["confirm"] =>
  async (action): Promise<ConfirmationOutcome> => {
    const token = await wait.createToken({
      timeout: ASSISTANT_CONFIRMATION_TIMEOUT,
      idempotencyKey: `${runId}:${action.stepIndex}`,
      tags: [`assistant:${runId}`],
    });
    await assistantService.markAwaiting(runId, {
      stepIndex: action.stepIndex,
      tool: action.tool,
      input: action.input,
      tokenId: token.id,
      requestedAt: nowIso(),
      response: null,
    });
    const result = await wait.forToken<{ approved: boolean }>(token);
    if (!result.ok) return "timeout";
    // Resumed: the row leaves `awaiting_confirmation` before the write runs.
    await assistantService.markWorking(runId);
    return result.output.approved ? "approved" : "declined";
  };

async function executeRun(
  run: AssistantRun,
  sheetId: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  await assistantService.markThinking(run.id);
  const context = await loadAssistantContext({
    workspaceId: run.workspaceId,
    scope: run.scope,
    sheetId,
  });
  const system = buildAssistantSystemPrompt(
    toPromptContext(run.scope, context),
  );
  const tools = toToolSet(toolSpecsForScope(run.scope));
  const executor = new AssistantExecutor(run, sheetId, {
    confirm: confirmWithUser(run.id),
  });
  const messages: ModelMessage[] = [{ role: "user", content: run.prompt }];
  let usage = EMPTY_USAGE;
  let model: string | null = null;
  let toolCalls = 0;
  let stepIndex = 0;

  for (let step = 0; step < MAX_ASSISTANT_STEPS; step++) {
    await assertStillRunning(run.id);
    if (step > 0) await assistantService.markThinking(run.id);
    const result = await runAssistantStep({
      system,
      messages,
      tools,
      abortSignal: signal,
    });
    usage = addUsage(usage, result.usage);
    model = result.model;
    messages.push(...result.responseMessages);

    if (result.kind === "text") {
      await assistantService.setTranscript(run.id, trimTranscript(messages));
      await assistantService.complete(run.id, {
        summary: result.text.trim() || null,
        model,
        usage,
      });
      return "completed";
    }

    const results: { toolCallId: string; toolName: string; output: unknown }[] =
      [];
    for (const call of result.calls) {
      const tool = assistantToolName.safeParse(call.toolName);
      if (!tool.success || toolCalls >= MAX_ASSISTANT_TOOL_CALLS) {
        const message = tool.success
          ? `This run may make at most ${MAX_ASSISTANT_TOOL_CALLS} tool calls; answer with a summary now.`
          : `Unknown tool "${call.toolName}".`;
        results.push({
          ...call,
          output: { error: { code: "TOOL_CALL_REFUSED", message } },
        });
        continue;
      }
      toolCalls += 1;
      const index = stepIndex++;
      await assertStillRunning(run.id);
      const started: AssistantStep = {
        index,
        tool: tool.data,
        input: summariseStepInput(tool.data, call.input),
        status: "running",
        mutated: false,
        summary: null,
        error: null,
        startedAt: nowIso(),
        finishedAt: null,
      };
      await assistantService.markWorking(run.id, started);
      const execution = await executor.execute(index, call);
      await assistantService.finishStep(run.id, index, {
        status: execution.status,
        mutated: execution.mutated,
        input: execution.input,
        error: execution.error,
      });
      logger.info("assistant tool call", {
        runId: run.id,
        tool: tool.data,
        status: execution.status,
        input: execution.input,
      });
      results.push({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: execution.output,
      });
    }
    messages.push(toolResultsMessage(results));
    await assistantService.setTranscript(run.id, trimTranscript(messages));
  }

  await assistantService.fail(run.id, {
    name: "AssistantStepLimit",
    message: `Stopped after ${MAX_ASSISTANT_STEPS} model steps without a final answer`,
  });
  return "failed";
}

export const assistantRunTask = schemaTask({
  id: "assistant-run",
  schema: assistantJobPayloadSchema,
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 5 },
  run: async ({ runId }, { signal }): Promise<AssistantRunOutcome> => {
    const run = await assistantService.byId(runId);
    if (isTerminalAssistantStatus(run.status)) {
      logger.warn("assistant run already finished, nothing to do", {
        runId,
        status: run.status,
      });
      return { runId, status: run.status };
    }
    if (run.spreadsheetId === null) {
      await assistantService.fail(runId, {
        name: "AssistantNoSheet",
        message: "The workspace has no spreadsheet to work on",
      });
      return { runId, status: "failed" };
    }
    try {
      const status = await executeRun(run, run.spreadsheetId, signal);
      return { runId, status };
    } catch (error) {
      if (error instanceof AssistantFinishedError) {
        logger.info("assistant run was cancelled", { runId });
        return { runId, status: "cancelled" };
      }
      if (error instanceof AssistantConfirmationTimeoutError) {
        await assistantService
          .cancel(runId, describeError(error))
          .catch(() => {});
        return { runId, status: "cancelled" };
      }
      const failure = describeError(error);
      logger.error("assistant run failed", { runId, ...failure });
      await assistantService.fail(runId, failure).catch(() => {});
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    // Idempotent on a run the catch above already failed; a no-op on a
    // cancelled one (the guarded write refuses to revive it).
    await assistantService
      .fail(payload.runId, describeError(error))
      .catch(() => {});
  },
});
