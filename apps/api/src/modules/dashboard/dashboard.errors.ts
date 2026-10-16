import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors). The bad_request ones
// name *where* in the payload the problem is ("widgets[2].query.series[0]
// .formula"), because the caller is as likely to be an LLM repairing its own
// output as a person.

/** `["widgets", 2, "query", "series", 0]` → "widgets[2].query.series[0]". */
export function formatPath(path: readonly (string | number)[]): string {
  return path.reduce<string>(
    (text, part) =>
      typeof part === "number"
        ? `${text}[${part}]`
        : text === ""
          ? part
          : `${text}.${part}`,
    "",
  );
}

const at = (path: readonly (string | number)[]) =>
  path.length === 0 ? "" : ` at ${formatPath(path)}`;

export class DashboardNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "DASHBOARD_NOT_FOUND";
  constructor(workspaceId: string) {
    super(`Workspace ${workspaceId} has no dashboard`);
    this.name = "DashboardNotFoundError";
  }
}

export class DashboardWidgetNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "DASHBOARD_WIDGET_NOT_FOUND";
  constructor(id: string) {
    super(`Dashboard widget ${id} not found`);
    this.name = "DashboardWidgetNotFoundError";
  }
}

export class DashboardLayoutInvalidError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "DASHBOARD_LAYOUT_INVALID";
  constructor(message: string, widgetIndex: number) {
    super(`Layout invalid at widgets[${widgetIndex}]: ${message}`);
    this.name = "DashboardLayoutInvalidError";
  }
}

export class DashboardUnknownColumnError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "DASHBOARD_UNKNOWN_COLUMN";
  constructor(column: string, path: readonly (string | number)[]) {
    super(`Column "${column}" is not in the sheet${at(path)}`);
    this.name = "DashboardUnknownColumnError";
  }
}

export class DashboardFormulaInvalidError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "DASHBOARD_FORMULA_INVALID";
  constructor(detail: string, path: readonly (string | number)[]) {
    super(`Formula invalid${at(path)}: ${detail}`);
    this.name = "DashboardFormulaInvalidError";
  }
}

/** A query that parses but makes no sense for its widget (see the engine's rules). */
export class DashboardQueryInvalidError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "DASHBOARD_QUERY_INVALID";
  constructor(message: string, path: readonly (string | number)[]) {
    super(`Query invalid${at(path)}: ${message}`);
    this.name = "DashboardQueryInvalidError";
  }
}

export class DashboardSpreadsheetMismatchError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "DASHBOARD_SPREADSHEET_MISMATCH";
  constructor(spreadsheetId: string, workspaceId: string) {
    super(
      `Spreadsheet ${spreadsheetId} does not belong to workspace ${workspaceId}`,
    );
    this.name = "DashboardSpreadsheetMismatchError";
  }
}

/** The starter only fills an empty dashboard; `replace` overwrites one. */
export class DashboardNotEmptyError extends DomainError {
  readonly kind = "conflict";
  readonly code = "DASHBOARD_NOT_EMPTY";
  constructor(workspaceId: string) {
    super(`Workspace ${workspaceId} already has dashboard widgets`);
    this.name = "DashboardNotEmptyError";
  }
}
