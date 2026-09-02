import type { Prisma } from "../../../generated/prisma/client";
import { isRecordNotFound } from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import { RunAiNotFoundError } from "./run-ai.errors";
import type {
  CompleteRunAiInput,
  CreateRunAiInput,
  FailRunAiInput,
  RunAi,
  RunAiResult,
} from "./run-ai.schema";
import { toWireRunAiStatus } from "./run-ai.schema";

// Framework-free: no @nestjs/* imports, no decorators — src/trpc/** imports
// the singleton below. Writes are service-only: the spreadsheet service or a
// Trigger.dev task calls them in-process; tRPC exposes the reads. `cellId` is
// stored as given (the scoped Cell pk) and never resolved against Cell.

const runAiSelect = {
  id: true,
  cellId: true,
  batchId: true,
  status: true,
  credit: true,
  result: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RunAiRecord = Prisma.RunAiGetPayload<{ select: typeof runAiSelect }>;

// Zod cannot express Prisma.InputJsonValue exactly; the runtime shapes match.
const toJsonInput = (result: RunAiResult): Prisma.InputJsonValue =>
  result as Prisma.InputJsonValue;

function toRunAi(record: RunAiRecord): RunAi {
  return {
    ...record,
    status: toWireRunAiStatus(record.status),
    // complete/fail are the only writers and only accept objects.
    result: (record.result ?? null) as RunAiResult | null,
  };
}

export class RunAiService {
  async create(input: CreateRunAiInput): Promise<RunAi> {
    const record = await prisma.runAi.create({
      data: {
        cellId: input.cellId,
        batchId: input.batchId,
        credit: input.credit ?? 0,
      },
      select: runAiSelect,
    });
    return toRunAi(record);
  }

  markRunning(id: string): Promise<RunAi> {
    return this.setStatus(id, { status: "RUNNING" });
  }

  complete(id: string, input: CompleteRunAiInput): Promise<RunAi> {
    return this.setStatus(id, {
      status: "COMPLETED",
      result: toJsonInput(input.result),
      ...(input.credit !== undefined && { credit: input.credit }),
    });
  }

  fail(id: string, input: FailRunAiInput = {}): Promise<RunAi> {
    return this.setStatus(id, {
      status: "FAILED",
      ...(input.result !== undefined && { result: toJsonInput(input.result) }),
    });
  }

  async byId(id: string): Promise<RunAi> {
    return toRunAi(await this.getOrThrow(id));
  }

  async listByBatch(batchId: string): Promise<RunAi[]> {
    const records = await prisma.runAi.findMany({
      where: { batchId },
      select: runAiSelect,
      orderBy: { createdAt: "asc" },
    });
    return records.map(toRunAi);
  }

  private async getOrThrow(id: string): Promise<RunAiRecord> {
    const record = await prisma.runAi.findUnique({
      where: { id },
      select: runAiSelect,
    });
    if (!record) throw new RunAiNotFoundError(id);
    return record;
  }

  /** One statement, no read-then-write: a miss surfaces as P2025. */
  private async setStatus(
    id: string,
    data: Prisma.RunAiUpdateInput,
  ): Promise<RunAi> {
    try {
      const record = await prisma.runAi.update({
        where: { id },
        data,
        select: runAiSelect,
      });
      return toRunAi(record);
    } catch (error) {
      if (isRecordNotFound(error)) throw new RunAiNotFoundError(id);
      throw error;
    }
  }
}

export const runAiService = new RunAiService();
