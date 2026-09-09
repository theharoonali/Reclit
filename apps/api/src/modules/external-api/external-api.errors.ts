import { DomainError } from "../../common/errors";

// The external-api feature's domain errors. Every code here is listed in the
// contract header of src/__tests__/external-api.api.test.ts.

export class ExternalApiNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "EXTERNAL_API_NOT_FOUND";
  constructor(id: string) {
    super(`External API result ${id} was not found`);
    this.name = "ExternalApiNotFoundError";
  }
}

/**
 * A write naming a cell that does not exist. `cellId` is a real foreign key,
 * so this is the database refusing the row (P2003) — a cell cleared or a sheet
 * re-imported while the worker was processing it.
 */
export class ExternalApiCellNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "EXTERNAL_API_CELL_NOT_FOUND";
  constructor(cellId: string) {
    super(`Cell ${cellId} does not exist`);
    this.name = "ExternalApiCellNotFoundError";
  }
}
