import { MAX_ASSISTANT_CELL_WRITES } from "./assistant.schema";

// What the tool handlers share with the executor: the run's coordinates, the
// per-run write budget, the error a handler throws when the model's input is
// wrong (reported back to the model, never failing the run), and the shape a
// handler answers. Framework-free, prisma-free.

export type ToolContext = {
  runId: string;
  workspaceId: string;
  sheetId: string;
  budget: ToolBudget;
};

/** What a handler answers; `extra` enriches the step's stored input (counts, ids). */
export type ToolResult = {
  output: unknown;
  mutated: boolean;
  extra?: Record<string, unknown>;
};

/**
 * The model asked for something that cannot be done as asked — an unknown
 * column, a budget overrun. The executor turns it into a failed step whose
 * message the model reads and corrects; the run goes on.
 */
export class ToolInputError extends Error {
  constructor(
    message: string,
    readonly code: string = "INVALID_INPUT",
  ) {
    super(message);
    this.name = "ToolInputError";
  }
}

/** Cell writes left to this run, across `setCells` and `fillColumn`. */
export class ToolBudget {
  private cellWrites = 0;

  constructor(private readonly maxCellWrites = MAX_ASSISTANT_CELL_WRITES) {}

  get remainingCellWrites(): number {
    return this.maxCellWrites - this.cellWrites;
  }

  takeCellWrites(count: number): void {
    if (count > this.remainingCellWrites) {
      throw new ToolInputError(
        `This run may write at most ${this.maxCellWrites} cells and has ${this.remainingCellWrites} left; ${count} were requested`,
        "BUDGET_EXCEEDED",
      );
    }
    this.cellWrites += count;
  }
}
