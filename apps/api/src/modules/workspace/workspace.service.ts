import { isRecordNotFound } from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import { DEFAULT_TOTAL_ROWS } from "../spreadsheet/spreadsheet.schema";
import { userService } from "../user/user.service";
import { LastWorkspaceError, WorkspaceNotFoundError } from "./workspace.errors";
import type {
  CreateWorkspaceInput,
  RenameWorkspaceInput,
  WorkspaceSummary,
} from "./workspace.schema";

// Framework-free: no @nestjs/* imports, no decorators — src/trpc/** imports
// the singleton below. Creating a workspace also creates its sheet, and
// renaming renames it: the sheet's name *is* the workspace's name
// (docs/plans/013-workspaces.md). Sheets are written through tx.spreadsheet
// directly, never through spreadsheetService, so the two services stay
// dependency-free of each other.

const summarySelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  spreadsheets: {
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 1,
  },
} as const;

type SummaryRecord = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  spreadsheets: { id: string }[];
};

function toSummary(record: SummaryRecord): WorkspaceSummary {
  const { spreadsheets, ...rest } = record;
  return { ...rest, spreadsheetId: spreadsheets[0]?.id ?? null };
}

export class WorkspaceService {
  async list(): Promise<WorkspaceSummary[]> {
    const records = await prisma.workspace.findMany({
      select: summarySelect,
      orderBy: { createdAt: "asc" },
    });
    return records.map(toSummary);
  }

  async byId(id: string): Promise<WorkspaceSummary> {
    const record = await prisma.workspace.findUnique({
      where: { id },
      select: summarySelect,
    });
    if (!record) throw new WorkspaceNotFoundError(id);
    return toSummary(record);
  }

  /** Atomic: a workspace can never exist without its same-named sheet. */
  async create(input: CreateWorkspaceInput): Promise<WorkspaceSummary> {
    const owner = await userService.me();
    return prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name: input.name, ownerId: owner.id },
        select: { id: true },
      });
      await tx.spreadsheet.create({
        data: {
          name: input.name,
          totalRows: DEFAULT_TOTAL_ROWS,
          workspaceId: workspace.id,
        },
        select: { id: true },
      });
      const record = await tx.workspace.findUniqueOrThrow({
        where: { id: workspace.id },
        select: summarySelect,
      });
      return toSummary(record);
    });
  }

  async rename({ id, name }: RenameWorkspaceInput): Promise<WorkspaceSummary> {
    try {
      const record = await prisma.$transaction(async (tx) => {
        const updated = await tx.workspace.update({
          where: { id },
          data: { name },
          select: summarySelect,
        });
        await tx.spreadsheet.updateMany({
          where: { workspaceId: id },
          data: { name },
        });
        return updated;
      });
      return toSummary(record);
    } catch (error) {
      if (isRecordNotFound(error)) throw new WorkspaceNotFoundError(id);
      throw error;
    }
  }

  /** FK cascade removes the sheet and, transitively, its columns/rows/cells. */
  async remove(id: string): Promise<{ id: string }> {
    try {
      // One transaction: two racing removes of an owner's last two workspaces
      // must not both pass the guard and leave the owner with none.
      await prisma.$transaction(async (tx) => {
        const record = await tx.workspace.findUnique({
          where: { id },
          select: { ownerId: true },
        });
        if (!record) throw new WorkspaceNotFoundError(id);
        const owned = await tx.workspace.count({
          where: { ownerId: record.ownerId },
        });
        if (owned <= 1) throw new LastWorkspaceError();
        await tx.workspace.delete({ where: { id } });
      });
      return { id };
    } catch (error) {
      if (isRecordNotFound(error)) throw new WorkspaceNotFoundError(id);
      throw error;
    }
  }
}

export const workspaceService = new WorkspaceService();
