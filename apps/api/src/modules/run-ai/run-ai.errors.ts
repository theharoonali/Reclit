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

/** The partial unique index `RunAi_active_cell_key` refused a second working run. */
export class RunAiCellBusyError extends DomainError {
  readonly kind = "conflict";
  readonly code = "RUN_AI_CELL_BUSY";
  constructor(cellId: string) {
    super(`Cell ${cellId} already has a run in progress`);
    this.name = "RunAiCellBusyError";
  }
}

/** The column is not an AI node, or has no prompt to run. */
export class RunAiColumnNotRunnableError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "RUN_AI_COLUMN_NOT_RUNNABLE";
  constructor(columnIndex: number) {
    super(`Column ${columnIndex} is not an AI column with a prompt`);
    this.name = "RunAiColumnNotRunnableError";
  }
}

/** The run was recorded but the worker could not be asked to execute it. */
export class RunAiDispatchError extends DomainError {
  readonly kind = "upstream";
  readonly code = "RUN_AI_DISPATCH_FAILED";
  constructor(id: string, cause: string) {
    super(`Run ${id} could not be enqueued: ${cause}`);
    this.name = "RunAiDispatchError";
  }
}

/** `markRunning` on a run that already reached `completed` / `failed`. */
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
