import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors). There is no
// RowNotFound or CellNotFound: a blank row or cell is a first-class value,
// not a miss.

export class SpreadsheetNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "SPREADSHEET_NOT_FOUND";
  constructor(id: string) {
    super(`Spreadsheet ${id} not found`);
    this.name = "SpreadsheetNotFoundError";
  }
}

export class SpreadsheetColumnNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "SPREADSHEET_COLUMN_NOT_FOUND";
  constructor(columnIndex: number) {
    super(`Column ${columnIndex} not found`);
    this.name = "SpreadsheetColumnNotFoundError";
  }
}

export class SpreadsheetCellTypeMismatchError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "SPREADSHEET_CELL_TYPE_MISMATCH";
  constructor(columnType: string, value: unknown) {
    super(
      `Value of type ${value === null ? "null" : typeof value} does not fit a ${columnType} column`,
    );
    this.name = "SpreadsheetCellTypeMismatchError";
  }
}

export class SpreadsheetRowExistsError extends DomainError {
  readonly kind = "conflict";
  readonly code = "SPREADSHEET_ROW_EXISTS";
  constructor(index: number) {
    super(`Row ${index} already exists`);
    this.name = "SpreadsheetRowExistsError";
  }
}

export class SpreadsheetColumnNotLastError extends DomainError {
  readonly kind = "conflict";
  readonly code = "SPREADSHEET_COLUMN_NOT_LAST";
  constructor(columnIndex: number, lastIndex: number) {
    super(
      `Only the last column (${lastIndex}) can be deleted; got ${columnIndex}`,
    );
    this.name = "SpreadsheetColumnNotLastError";
  }
}
