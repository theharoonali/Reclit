import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors).

export class RunAiNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "RUN_AI_NOT_FOUND";
  constructor(id: string) {
    super(`RunAi ${id} not found`);
    this.name = "RunAiNotFoundError";
  }
}

/**
 * A selected cell already has a working run: the batch pre-check found it, or
 * the partial unique index `RunAi_active_cell_key` refused the insert.
 */
export class RunAiCellBusyError extends DomainError {
  readonly kind = "conflict";
  readonly code = "RUN_AI_CELL_BUSY";
  readonly cellIds: string[];
  constructor(cellIds: string | string[]) {
    const ids = Array.isArray(cellIds) ? cellIds : [cellIds];
    super(
      ids.length === 1
        ? `Cell ${ids[0]} already has a run in progress`
        : `Cells ${ids.join(", ")} already have a run in progress`,
    );
    this.name = "RunAiCellBusyError";
    this.cellIds = ids;
  }
}

/** The column is not an AI node, or has no prompt to run — none of them, for a selection. */
export class RunAiColumnNotRunnableError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "RUN_AI_COLUMN_NOT_RUNNABLE";
  constructor(columnIndex: number | number[]) {
    const indexes = Array.isArray(columnIndex) ? columnIndex : [columnIndex];
    super(
      indexes.length === 1
        ? `Column ${indexes[0]} is not a runnable node column`
        : `None of columns ${indexes.join(", ")} is a runnable node column`,
    );
    this.name = "RunAiColumnNotRunnableError";
  }
}

/** The selection would create more runs than one click may. */
export class RunAiBatchTooLargeError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "RUN_AI_BATCH_TOO_LARGE";
  constructor(cells: number, max: number) {
    super(`The selection holds ${cells} AI cells; at most ${max} run at once`);
    this.name = "RunAiBatchTooLargeError";
  }
}

/** The runs were recorded but the worker could not be asked to execute them. */
export class RunAiDispatchError extends DomainError {
  readonly kind = "upstream";
  readonly code = "RUN_AI_DISPATCH_FAILED";
  constructor(batchId: string, cause: string) {
    super(`Batch ${batchId} could not be enqueued: ${cause}`);
    this.name = "RunAiDispatchError";
  }
}

/** A transition on a run that already reached `completed` / `failed`. */
export class RunAiFinishedError extends DomainError {
  readonly kind = "conflict";
  readonly code = "RUN_AI_FINISHED";
  constructor(id: string) {
    super(`Run ${id} has already finished`);
    this.name = "RunAiFinishedError";
  }
}

/** `cellId` is not the scoped form "<sheetId>.cell.<row>.<col>". */
export class RunAiInvalidCellIdError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "RUN_AI_INVALID_CELL_ID";
  constructor(cellId: string) {
    super(
      `"${cellId}" is not a cell id of the form <sheetId>.cell.<row>.<col>`,
    );
    this.name = "RunAiInvalidCellIdError";
  }
}
