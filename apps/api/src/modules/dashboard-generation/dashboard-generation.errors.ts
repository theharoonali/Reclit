import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors). A workspace without a
// sheet reuses `SpreadsheetNotFoundError` from the spreadsheet feature.

export class DashboardGenerationNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "DASHBOARD_GENERATION_NOT_FOUND";
  constructor(id: string) {
    super(`Dashboard generation ${id} not found`);
    this.name = "DashboardGenerationNotFoundError";
  }
}

/** The workspace already has a generation that is not finished (partial unique index `DashboardGeneration_active_workspace_key`). */
export class DashboardGenerationBusyError extends DomainError {
  readonly kind = "conflict";
  readonly code = "DASHBOARD_GENERATION_BUSY";
  constructor(workspaceId: string) {
    super(
      `Workspace ${workspaceId} already has a dashboard generation in progress`,
    );
    this.name = "DashboardGenerationBusyError";
  }
}

/** A transition on a generation that already reached `completed` / `failed` / `cancelled`. */
export class DashboardGenerationFinishedError extends DomainError {
  readonly kind = "conflict";
  readonly code = "DASHBOARD_GENERATION_FINISHED";
  constructor(id: string) {
    super(`Dashboard generation ${id} has already finished`);
    this.name = "DashboardGenerationFinishedError";
  }
}

/** The generation was recorded but the worker could not be asked to execute it. */
export class DashboardGenerationDispatchError extends DomainError {
  readonly kind = "upstream";
  readonly code = "DASHBOARD_GENERATION_DISPATCH_FAILED";
  constructor(id: string, cause: string) {
    super(`Dashboard generation ${id} could not be enqueued: ${cause}`);
    this.name = "DashboardGenerationDispatchError";
  }
}

/** `dashboardGeneration.start` without a `GOOGLE_GENERATIVE_AI_API_KEY` on the api. */
export class DashboardGenerationUnavailableError extends DomainError {
  readonly kind = "unavailable";
  readonly code = "DASHBOARD_GENERATION_UNAVAILABLE";
  constructor() {
    super(
      "Dashboard generation is not configured: GOOGLE_GENERATIVE_AI_API_KEY is not set",
    );
    this.name = "DashboardGenerationUnavailableError";
  }
}
