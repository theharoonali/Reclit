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

export class SpreadsheetPromptWithoutNodeError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "SPREADSHEET_PROMPT_WITHOUT_NODE";
  constructor() {
    super("A prompt requires a node; the column has none");
    this.name = "SpreadsheetPromptWithoutNodeError";
  }
}

/**
 * A reorder target outside the sheet's 0..n-1 range. Rejected rather than
 * clamped: an out-of-range position means the client's view of the column
 * order is stale, and clamping would hide that.
 */
export class SpreadsheetSortOrderOutOfRangeError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "SPREADSHEET_SORT_ORDER_OUT_OF_RANGE";
  constructor(sortOrder: number, max: number) {
    super(`Sort order ${sortOrder} is outside 0..${max}`);
    this.name = "SpreadsheetSortOrderOutOfRangeError";
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

// Import failures. All `bad_request`: `conflict` in this repo means the sheet's
// state forbids the operation, and an import is state-indifferent by design —
// it overwrites whatever is there. Every import failure is a bad payload.

export class SpreadsheetImportUnsupportedTypeError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE";
  constructor(filename: string) {
    super(`Cannot import "${filename}": only .csv and .xlsx are supported`);
    this.name = "SpreadsheetImportUnsupportedTypeError";
  }
}

export class SpreadsheetImportEmptyError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "SPREADSHEET_IMPORT_EMPTY";
  constructor() {
    super("The uploaded file has no rows");
    this.name = "SpreadsheetImportEmptyError";
  }
}

export class SpreadsheetImportNoHeaderError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "SPREADSHEET_IMPORT_NO_HEADER";
  constructor() {
    super("The first row of the file is blank; it must name the columns");
    this.name = "SpreadsheetImportNoHeaderError";
  }
}

export class SpreadsheetImportUnreadableError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "SPREADSHEET_IMPORT_UNREADABLE";
  constructor(reason: string) {
    super(`The uploaded file could not be read: ${reason}`);
    this.name = "SpreadsheetImportUnreadableError";
  }
}

export class SpreadsheetImportTooLargeError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "SPREADSHEET_IMPORT_TOO_LARGE";
  constructor(what: "rows" | "columns", got: number, max: number) {
    super(`The file has ${got} ${what}; the limit is ${max}`);
    this.name = "SpreadsheetImportTooLargeError";
  }
}
