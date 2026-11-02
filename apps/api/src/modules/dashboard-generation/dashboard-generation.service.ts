import { Prisma } from "../../../generated/prisma/client";
import {
  isRecordNotFound,
  isUniqueViolation,
} from "../../common/prisma-errors";
import { prisma, toJsonInput } from "../../db/prisma";
import type {
  AssistantError,
  AssistantUsage,
} from "../assistant/assistant.schema";
import {
  DashboardGenerationBusyError,
  DashboardGenerationFinishedError,
  DashboardGenerationNotFoundError,
} from "./dashboard-generation.errors";
import type {
  CompleteGenerationInput,
  CreateGenerationInput,
  DashboardBrief,
  DashboardGeneration,
  GenerationPhase,
  GenerationResult,
  GenerationStatus,
  GenerationStep,
} from "./dashboard-generation.schema";
import {
  GENERATION_TERMINAL_STATUSES_DB,
  MAX_GENERATION_TEXT,
  toDbGenerationPhase,
  toDbGenerationSource,
  toWireGenerationPhase,
  toWireGenerationSource,
  toWireGenerationStatus,
} from "./dashboard-generation.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The generation's reads
// and every transition. The API creates a generation and may cancel it; the
// Trigger.dev task owns every other transition. The database enforces one
// active generation per workspace (partial unique index
// `DashboardGeneration_active_workspace_key`). Starting and cancelling — the
// parts that reach the worker — live in dashboard-generation-control.service.ts;
// the live stream in dashboard-generation-changes.service.ts.

const generationSelect = {
  id: true,
  workspaceId: true,
  spreadsheetId: true,
  source: true,
  status: true,
  phase: true,
  attempt: true,
  awaitBatchId: true,
  log: true,
  brief: true,
  result: true,
  error: true,
  model: true,
  usage: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** How many rows a reconnecting subscriber may replay. */
const REPLAY_LIMIT = 100;

/** The `where` half of "still active": any status but the terminal three. */
const ACTIVE: Prisma.StringFilter<"DashboardGeneration"> = {
  notIn: [...GENERATION_TERMINAL_STATUSES_DB],
};

type GenerationRecord = Prisma.DashboardGenerationGetPayload<{
  select: typeof generationSelect;
}>;

function toGeneration(record: GenerationRecord): DashboardGeneration {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    spreadsheetId: record.spreadsheetId,
    source: toWireGenerationSource(record.source),
    status: toWireGenerationStatus(record.status),
    phase: toWireGenerationPhase(record.phase),
    attempt: record.attempt,
    awaitBatchId: record.awaitBatchId,
    // The service is the only writer of these columns and every write passed
    // the schema (the `ExternalApi.output` precedent).
    log: (record.log ?? []) as GenerationStep[],
    brief: (record.brief ?? null) as DashboardBrief | null,
    result: (record.result ?? null) as GenerationResult | null,
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

/** The log with its open entry (if any) closed as `status`. */
function closeOpenStep(
  log: GenerationStep[],
  status: Exclude<GenerationStep["status"], "running">,
): GenerationStep[] {
  const finishedAt = nowIso();
  return log.map((step) =>
    step.status === "running" ? { ...step, status, finishedAt } : step,
  );
}

export class DashboardGenerationService {
  async create(input: CreateGenerationInput): Promise<DashboardGeneration> {
    try {
      const record = await prisma.dashboardGeneration.create({
        data: {
          workspaceId: input.workspaceId,
          spreadsheetId: input.spreadsheetId,
          source: toDbGenerationSource(input.source),
          awaitBatchId: input.awaitBatchId,
        },
        select: generationSelect,
      });
      return toGeneration(record);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DashboardGenerationBusyError(input.workspaceId);
      }
      throw error;
    }
  }

  /** A generation, or null. The stream uses this: a row deleted between a notify and its read is not an event. */
  async find(id: string): Promise<DashboardGeneration | null> {
    const record = await prisma.dashboardGeneration.findUnique({
      where: { id },
      select: generationSelect,
    });
    return record ? toGeneration(record) : null;
  }

  async byId(id: string): Promise<DashboardGeneration> {
    const generation = await this.find(id);
    if (!generation) throw new DashboardGenerationNotFoundError(id);
    return generation;
  }

  /** The workspace's one active generation — the index allows at most one. */
  async active(workspaceId: string): Promise<DashboardGeneration | null> {
    const record = await prisma.dashboardGeneration.findFirst({
      where: { workspaceId, status: ACTIVE },
      orderBy: { createdAt: "desc" },
      select: generationSelect,
    });
    return record ? toGeneration(record) : null;
  }

  /** The workspace's newest generation, active or not — what the page shows after a reload. */
  async latest(workspaceId: string): Promise<DashboardGeneration | null> {
    const record = await prisma.dashboardGeneration.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: generationSelect,
    });
    return record ? toGeneration(record) : null;
  }

  /** Rows touched at or after `since`, oldest first — the reconnect replay. */
  async listChangedSince(
    workspaceId: string,
    since: Date,
  ): Promise<DashboardGeneration[]> {
    const records = await prisma.dashboardGeneration.findMany({
      where: { workspaceId, updatedAt: { gte: since } },
      orderBy: { updatedAt: "asc" },
      take: REPLAY_LIMIT,
      select: generationSelect,
    });
    return records.map(toGeneration);
  }

  /** The workspace's newest `updatedAt` in ms — the snapshot's event id; "0" with no generations. */
  async latestEventId(workspaceId: string): Promise<string> {
    const latest = await prisma.dashboardGeneration.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });
    return String(latest?.updatedAt.getTime() ?? 0);
  }

  /** What the control service needs beyond the wire shape: the worker handle. */
  async controlInfo(
    id: string,
  ): Promise<{ status: GenerationStatus; triggerRunId: string | null }> {
    const record = await prisma.dashboardGeneration.findUnique({
      where: { id },
      select: { status: true, triggerRunId: true },
    });
    if (!record) throw new DashboardGenerationNotFoundError(id);
    return {
      status: toWireGenerationStatus(record.status),
      triggerRunId: record.triggerRunId,
    };
  }

  /** Stored right after `tasks.trigger` answers; a terminal row keeps it too (audit). */
  setTriggerRunId(
    id: string,
    triggerRunId: string,
  ): Promise<DashboardGeneration> {
    return this.update(id, { triggerRunId });
  }

  /**
   * The worker enters a phase: the open log entry is closed `done`, a new one
   * appended `running`, and `phase` / `attempt` follow. `detail` is a short
   * line the progress UI shows under the step ("12 cells", "5 cards").
   */
  async markRunning(
    id: string,
    phase: GenerationPhase,
    attempt: number,
    detail?: string | null,
  ): Promise<DashboardGeneration> {
    const generation = await this.byId(id);
    const step: GenerationStep = {
      phase,
      attempt,
      status: "running",
      detail: clip(detail, MAX_GENERATION_TEXT),
      startedAt: nowIso(),
      finishedAt: null,
    };
    return this.updateActive(id, {
      status: "RUNNING",
      phase: toDbGenerationPhase(phase),
      attempt,
      log: toJsonInput([...closeOpenStep(generation.log, "done"), step]),
    });
  }

  /** The analyze phase's answer, kept so the progress UI (and a retry) can show it. */
  setBrief(id: string, brief: DashboardBrief): Promise<DashboardGeneration> {
    return this.updateActive(id, { brief: toJsonInput(brief) });
  }

  async complete(
    id: string,
    input: CompleteGenerationInput,
  ): Promise<DashboardGeneration> {
    const generation = await this.byId(id);
    return this.updateActive(id, {
      status: "COMPLETED",
      phase: toDbGenerationPhase("done"),
      log: toJsonInput(closeOpenStep(generation.log, "done")),
      result: toJsonInput(input.result),
      model: input.model,
      usage: input.usage ? toJsonInput(input.usage) : Prisma.DbNull,
    });
  }

  async fail(id: string, error: AssistantError): Promise<DashboardGeneration> {
    const generation = await this.byId(id);
    return this.updateActive(id, {
      status: "FAILED",
      log: toJsonInput(closeOpenStep(generation.log, "failed")),
      error: toJsonInput(error),
    });
  }

  /** By the user; the worker exits on the cancelled row at its next look. */
  async cancel(id: string): Promise<DashboardGeneration> {
    const generation = await this.byId(id);
    return this.updateActive(id, {
      status: "CANCELLED",
      log: toJsonInput(closeOpenStep(generation.log, "failed")),
    });
  }

  /** A guarded write: only an active generation changes; a finished one is reported, never revived. */
  private async updateActive(
    id: string,
    data: Prisma.DashboardGenerationUpdateManyMutationInput,
  ): Promise<DashboardGeneration> {
    const { count } = await prisma.dashboardGeneration.updateMany({
      where: { id, status: ACTIVE },
      data,
    });
    if (count === 0) {
      await this.byId(id); // NOT_FOUND if the generation never existed
      throw new DashboardGenerationFinishedError(id);
    }
    return this.byId(id);
  }

  /** One statement, no read-then-write: a miss surfaces as P2025. */
  private async update(
    id: string,
    data: Prisma.DashboardGenerationUpdateInput,
  ): Promise<DashboardGeneration> {
    try {
      const record = await prisma.dashboardGeneration.update({
        where: { id },
        data,
        select: generationSelect,
      });
      return toGeneration(record);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new DashboardGenerationNotFoundError(id);
      }
      throw error;
    }
  }
}

export const dashboardGenerationService = new DashboardGenerationService();
