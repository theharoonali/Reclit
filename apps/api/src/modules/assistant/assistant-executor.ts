import { DomainError, describeError } from "../../common/errors";
import {
  type AssistantDestructiveToolName,
  type AssistantRun,
  type AssistantScopeWire,
  type AssistantStepStatus,
  type AssistantToolName,
  assistantToolName,
  isDestructiveTool,
  toolsForScope as toolNamesForScope,
} from "./assistant.schema";
import {
  prepareRemoveWidget,
  runDashboardTool,
} from "./assistant-dashboard-tools";
import {
  type PreparedDelete,
  prepareRemoveColumn,
  prepareRemoveRows,
  runSheetTool,
} from "./assistant-sheet-tools";
import {
  ToolBudget,
  type ToolContext,
  ToolInputError,
  type ToolResult,
} from "./assistant-tool-runtime";
import { ASSISTANT_TOOLS, summariseStepInput } from "./assistant-tools";

// One run's tool calls, executed one at a time against the services. The
// executor validates the model's input, enforces the scope and the write
// budget, asks the user before a delete, and turns every refusal — a wrong
// column, a rule the dashboard rejects — into a failed step the model reads
// and corrects. Only an unexpected error escapes and fails the run. Runs on
// the worker; framework-free, prisma-free (it only calls services).

/** What the user answered, or that nobody did in time. */
export type ConfirmationOutcome = "approved" | "declined" | "timeout";

export type ExecutorDeps = {
  /** Pauses the run until the user answers; the executor records the step around it. */
  confirm(action: {
    stepIndex: number;
    tool: AssistantDestructiveToolName;
    input: Record<string, unknown>;
  }): Promise<ConfirmationOutcome>;
};

export type ToolCall = { toolCallId: string; toolName: string; input: unknown };

/** A finished step: what the run records and what the model is told. */
export type ToolExecution = {
  status: Exclude<AssistantStepStatus, "running">;
  mutated: boolean;
  /** The summarised input, as stored on the step (with the executor's counts). */
  input: Record<string, unknown>;
  /** Handed back to the model as the tool result. */
  output: unknown;
  error: string | null;
};

/** Thrown when a confirmation timed out: the task cancels the run. */
export class AssistantConfirmationTimeoutError extends Error {
  constructor(tool: string) {
    super(`The confirmation for ${tool} was not answered in time`);
    this.name = "AssistantConfirmationTimeoutError";
  }
}

export class AssistantExecutor {
  private readonly ctx: ToolContext;
  private readonly allowed: ReadonlySet<string>;

  constructor(
    run: AssistantRun,
    sheetId: string,
    private readonly deps: ExecutorDeps,
  ) {
    this.ctx = {
      runId: run.id,
      workspaceId: run.workspaceId,
      sheetId,
      budget: new ToolBudget(),
    };
    this.allowed = new Set(toolNamesForScope(run.scope));
  }

  /** Validates, confirms when destructive, runs, and never throws for the model's mistakes. */
  async execute(stepIndex: number, call: ToolCall): Promise<ToolExecution> {
    const tool = this.toolOf(call.toolName);
    if (!tool) {
      return failed(
        {},
        `Unknown tool "${call.toolName}"; the available tools are ${[...this.allowed].join(", ")}`,
      );
    }
    const parsed = ASSISTANT_TOOLS[tool].inputSchema.safeParse(call.input);
    if (!parsed.success) {
      return failed(
        summariseStepInput(tool, call.input),
        `Invalid input for ${tool}: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "input"} ${issue.message}`)
          .join("; ")}`,
      );
    }
    const input = parsed.data;
    const summary = summariseStepInput(tool, input);
    try {
      if (isDestructiveTool(tool)) {
        return await this.executeDelete(stepIndex, tool, input, summary);
      }
      const result = await this.run(tool, input);
      return done(tool, input, result);
    } catch (error) {
      if (error instanceof ToolInputError || error instanceof DomainError) {
        return failed(summary, `${error.code}: ${error.message}`, error.code);
      }
      throw error;
    }
  }

  private async executeDelete(
    stepIndex: number,
    tool: AssistantDestructiveToolName,
    input: unknown,
    summary: Record<string, unknown>,
  ): Promise<ToolExecution> {
    const prepared = await this.prepareDelete(tool, input);
    const described = { ...summary, ...prepared.extra };
    const outcome = await this.deps.confirm({
      stepIndex,
      tool,
      input: described,
    });
    if (outcome === "timeout")
      throw new AssistantConfirmationTimeoutError(tool);
    if (outcome === "declined") {
      return {
        status: "declined",
        mutated: false,
        input: described,
        output: {
          declined: true,
          message: "The user chose to keep it. Do not try again.",
        },
        error: null,
      };
    }
    const result = await prepared.execute();
    return done(tool, input, {
      ...result,
      extra: { ...prepared.extra, ...result.extra },
    });
  }

  private prepareDelete(
    tool: AssistantDestructiveToolName,
    input: unknown,
  ): Promise<PreparedDelete> {
    switch (tool) {
      case "removeColumn":
        return prepareRemoveColumn(this.ctx, input as never);
      case "removeRows":
        return prepareRemoveRows(this.ctx, input as never);
      case "removeWidget":
        return prepareRemoveWidget(this.ctx, input as never);
    }
  }

  private run(
    tool: Exclude<AssistantToolName, AssistantDestructiveToolName>,
    input: unknown,
  ): Promise<ToolResult> {
    switch (tool) {
      case "createWidget":
      case "updateWidget":
      case "updateDashboard":
        return runDashboardTool(this.ctx, tool, input);
      default:
        return runSheetTool(this.ctx, tool, input);
    }
  }

  /** The tool name, if it is one and this scope offers it. */
  private toolOf(name: string): AssistantToolName | null {
    const parsed = assistantToolName.safeParse(name);
    if (!parsed.success || !this.allowed.has(parsed.data)) return null;
    return parsed.data;
  }
}

function done(
  tool: AssistantToolName,
  input: unknown,
  result: ToolResult,
): ToolExecution {
  return {
    status: "done",
    mutated: result.mutated,
    input: summariseStepInput(tool, input, result.extra),
    output: result.output,
    error: null,
  };
}

function failed(
  input: Record<string, unknown>,
  message: string,
  code = "INVALID_INPUT",
): ToolExecution {
  return {
    status: "failed",
    mutated: false,
    input,
    output: { error: { code, message } },
    error: message,
  };
}

/** The scope's tool specs — what the model is handed — by name. */
export const toolSpecsForScope = (scope: AssistantScopeWire) =>
  Object.fromEntries(
    toolNamesForScope(scope).map((name) => [name, ASSISTANT_TOOLS[name]]),
  );

/** Re-exported for the task's logs. */
export const describeToolError = describeError;
