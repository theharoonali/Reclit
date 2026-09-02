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
