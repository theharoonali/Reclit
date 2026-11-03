import { Prisma } from "../../../generated/prisma/client";
import { present } from "../../common/ai-run";
import {
  isRecordNotFound,
  isUniqueViolation,
} from "../../common/prisma-errors";
import { prisma, toJsonInput } from "../../db/prisma";
import {
  AssistantBusyError,
  AssistantFinishedError,
  AssistantNotAwaitingError,
  AssistantNotFoundError,
} from "./assistant.errors";
import type {
  AssistantError,
  AssistantPendingAction,
  AssistantRun,
  AssistantStatus,
  AssistantStep,
  AssistantUsage,
  CompleteAssistantRunInput,
  CreateAssistantRunInput,
  FinishAssistantStepInput,
} from "./assistant.schema";
import {
  ASSISTANT_TERMINAL_STATUSES_DB,
  MAX_ASSISTANT_STEP_TEXT,
  MAX_ASSISTANT_SUMMARY,
  toDbAssistantScope,
  toDbAssistantSource,
  toWireAssistantScope,
  toWireAssistantSource,
  toWireAssistantStatus,
} from "./assistant.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The run's reads and
// every transition. The API creates a run and may cancel it or record the
// user's answer to a confirmation; the Trigger.dev task owns every other
// transition. The database enforces one active run per workspace (partial
// unique index `AiRun_active_assistant_key`). Starting, cancelling and
// responding — the parts that reach the worker — live in
// assistant-control.service.ts; the live stream in assistant-changes.service.ts.
// Assistant runs are the `ASSISTANT` kind of the shared `AiRun` table: every
// query below carries `KIND`.

const KIND = { kind: "ASSISTANT" } as const;

const assistantSelect = {
  id: true,
  workspaceId: true,
  spreadsheetId: true,
  scope: true,
  source: true,
  prompt: true,
  status: true,
  steps: true,
  pendingAction: true,
  summary: true,
  error: true,
  model: true,
  usage: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** How many rows a reconnecting subscriber may replay. */
const REPLAY_LIMIT = 100;

/** The `where` half of "still active": any status but the terminal three. */
const ACTIVE: Prisma.StringFilter<"AiRun"> = {
  notIn: [...ASSISTANT_TERMINAL_STATUSES_DB],
};

type AssistantRecord = Prisma.AiRunGetPayload<{
  select: typeof assistantSelect;
}>;

function toAssistantRun(record: AssistantRecord): AssistantRun {
  return {
    id: record.id,
    workspaceId: present(record.workspaceId, "workspaceId", record.id),
    spreadsheetId: record.spreadsheetId,
    scope: toWireAssistantScope(present(record.scope, "scope", record.id)),
    source: toWireAssistantSource(present(record.source, "source", record.id)),
    prompt: present(record.prompt, "prompt", record.id),
    status: toWireAssistantStatus(record.status),
    // The service is the only writer of these columns and every write passed
    // the schema (the `ExternalApi.output` precedent).
    steps: (record.steps ?? []) as AssistantStep[],
    pendingAction: (record.pendingAction ??
      null) as AssistantPendingAction | null,
    summary: record.summary,
    error: (record.error ?? null) as AssistantError | null,
    model: record.model,
    usage: (record.usage ?? null) as AssistantUsage | null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

const nowIso = () => new Date().toISOString();

/** Text as stored and streamed: never longer than its cap. */
function clip(text: string | null | undefined, max: number): string | null {
  if (text === null || text === undefined) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export class AssistantService {
  async create(input: CreateAssistantRunInput): Promise<AssistantRun> {
    try {
      const record = await prisma.aiRun.create({
        data: {
          ...KIND,
          workspaceId: input.workspaceId,
          spreadsheetId: input.spreadsheetId,
          scope: toDbAssistantScope(input.scope),
          source: toDbAssistantSource(input.source),
          prompt: input.prompt,
          steps: [],
        },
        select: assistantSelect,
      });
      return toAssistantRun(record);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AssistantBusyError(input.workspaceId);
      }
      throw error;
    }
  }

  /** A run, or null. The stream uses this: a row deleted between a notify and its read is not an event. */
  async find(id: string): Promise<AssistantRun | null> {
    const record = await prisma.aiRun.findUnique({
      where: { id, ...KIND },
      select: assistantSelect,
    });
    return record ? toAssistantRun(record) : null;
  }

  async byId(id: string): Promise<AssistantRun> {
    const run = await this.find(id);
    if (!run) throw new AssistantNotFoundError(id);
    return run;
  }

  /** The workspace's one active run — the index allows at most one. */
  async active(workspaceId: string): Promise<AssistantRun | null> {
    const record = await prisma.aiRun.findFirst({
      where: { ...KIND, workspaceId, status: ACTIVE },
      orderBy: { createdAt: "desc" },
      select: assistantSelect,
    });
    return record ? toAssistantRun(record) : null;
  }

  /** Rows touched at or after `since`, oldest first — the reconnect replay. */
  async listChangedSince(
    workspaceId: string,
    since: Date,
  ): Promise<AssistantRun[]> {
    const records = await prisma.aiRun.findMany({
      where: { ...KIND, workspaceId, updatedAt: { gte: since } },
      orderBy: { updatedAt: "asc" },
      take: REPLAY_LIMIT,
      select: assistantSelect,
    });
    return records.map(toAssistantRun);
  }

  /** The workspace's newest `updatedAt` in ms — the snapshot's event id; "0" with no runs. */
  async latestEventId(workspaceId: string): Promise<string> {
    const latest = await prisma.aiRun.findFirst({
      where: { ...KIND, workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });
    return String(latest?.updatedAt.getTime() ?? 0);
  }

  /** What the control service needs beyond the wire shape: the worker handle. */
  async controlInfo(id: string): Promise<{
    status: AssistantStatus;
    triggerRunId: string | null;
    pendingAction: AssistantPendingAction | null;
  }> {
    const record = await prisma.aiRun.findUnique({
      where: { id, ...KIND },
      select: { status: true, triggerRunId: true, pendingAction: true },
    });
    if (!record) throw new AssistantNotFoundError(id);
    return {
      status: toWireAssistantStatus(record.status),
      triggerRunId: record.triggerRunId,
      pendingAction: (record.pendingAction ??
        null) as AssistantPendingAction | null,
    };
  }

  /** Stored right after `tasks.trigger` answers; a terminal row keeps it too (audit). */
  setTriggerRunId(id: string, triggerRunId: string): Promise<AssistantRun> {
    return this.update(id, { triggerRunId });
  }

  /** The model conversation so far — audit only, never selected onto the wire. */
  setTranscript(id: string, transcript: unknown): Promise<AssistantRun> {
    return this.update(id, { transcript: toJsonInput(transcript) });
  }

  /** The worker is about to call the model. */
  markThinking(id: string): Promise<AssistantRun> {
    return this.updateActive(id, { status: "THINKING" });
  }

  /**
   * The worker is executing a tool: with `step`, appends it as `running`;
   * without, only flips the status (resuming after a confirmation).
   */
  async markWorking(id: string, step?: AssistantStep): Promise<AssistantRun> {
    if (!step) return this.updateActive(id, { status: "WORKING" });
    const run = await this.byId(id);
    return this.updateActive(id, {
      status: "WORKING",
      steps: toJsonInput([...run.steps, step]),
    });
  }

  /**
   * Closes one step. Clears `pendingAction` when the step was the one waiting
   * for the user, so the capsule's confirmation goes with it.
   */
  async finishStep(
    id: string,
    index: number,
    outcome: FinishAssistantStepInput,
  ): Promise<AssistantRun> {
    const run = await this.byId(id);
    const finishedAt = nowIso();
    const steps = run.steps.map((step) =>
      step.index === index
        ? {
            ...step,
            ...(outcome.input && { input: outcome.input }),
            status: outcome.status,
            mutated: outcome.mutated,
            summary: clip(outcome.summary, MAX_ASSISTANT_STEP_TEXT),
            error: clip(outcome.error, MAX_ASSISTANT_STEP_TEXT),
            finishedAt,
          }
        : step,
    );
    const clearsPending = run.pendingAction?.stepIndex === index;
    return this.updateActive(id, {
      status: "WORKING",
      steps: toJsonInput(steps),
      ...(clearsPending && { pendingAction: Prisma.DbNull }),
    });
  }

  /** A destructive tool call is waiting for the user; the worker is suspended on `action.tokenId`. */
  markAwaiting(
    id: string,
    action: AssistantPendingAction,
  ): Promise<AssistantRun> {
    return this.updateActive(id, {
      status: "AWAITING_CONFIRMATION",
      pendingAction: toJsonInput(action),
    });
  }

  /**
   * The user's answer, stored on the pending action before the worker is
   * woken. Only an unanswered confirmation takes it; the status stays
   * `awaiting_confirmation` until the worker resumes.
   */
  async recordResponse(id: string, approved: boolean): Promise<AssistantRun> {
    const run = await this.byId(id);
    if (
      run.status !== "awaiting_confirmation" ||
      !run.pendingAction ||
      run.pendingAction.response
    ) {
      throw new AssistantNotAwaitingError(id);
    }
    const action: AssistantPendingAction = {
      ...run.pendingAction,
      response: { approved, at: nowIso() },
    };
    const { count } = await prisma.aiRun.updateMany({
      where: { id, ...KIND, status: "AWAITING_CONFIRMATION" },
      data: { pendingAction: toJsonInput(action) },
    });
    if (count === 0) throw new AssistantNotAwaitingError(id);
    return this.byId(id);
  }

  complete(
    id: string,
    input: CompleteAssistantRunInput,
  ): Promise<AssistantRun> {
    return this.updateActive(id, {
      status: "COMPLETED",
      summary: clip(input.summary, MAX_ASSISTANT_SUMMARY),
      model: input.model,
      usage: input.usage ? toJsonInput(input.usage) : Prisma.DbNull,
      pendingAction: Prisma.DbNull,
    });
  }

  fail(id: string, error: AssistantError): Promise<AssistantRun> {
    return this.updateActive(id, {
      status: "FAILED",
      error: toJsonInput(error),
      pendingAction: Prisma.DbNull,
    });
  }

  /** By the user, or by the worker when a confirmation timed out (`cause` says which). */
  cancel(id: string, cause?: AssistantError): Promise<AssistantRun> {
    return this.updateActive(id, {
      status: "CANCELLED",
      pendingAction: Prisma.DbNull,
      ...(cause && { error: toJsonInput(cause) }),
    });
  }

  /** A guarded write: only an active run changes; a finished one is reported, never revived. */
  private async updateActive(
    id: string,
    data: Prisma.AiRunUpdateManyMutationInput,
  ): Promise<AssistantRun> {
    const { count } = await prisma.aiRun.updateMany({
      where: { id, ...KIND, status: ACTIVE },
      data,
    });
    if (count === 0) {
      await this.byId(id); // NOT_FOUND if the run never existed
      throw new AssistantFinishedError(id);
    }
    return this.byId(id);
  }

  /** One statement, no read-then-write: a miss surfaces as P2025. */
  private async update(
    id: string,
    data: Prisma.AiRunUpdateInput,
  ): Promise<AssistantRun> {
    try {
      const record = await prisma.aiRun.update({
        where: { id, ...KIND },
        data,
        select: assistantSelect,
      });
      return toAssistantRun(record);
    } catch (error) {
      if (isRecordNotFound(error)) throw new AssistantNotFoundError(id);
      throw error;
    }
  }
}

export const assistantService = new AssistantService();
