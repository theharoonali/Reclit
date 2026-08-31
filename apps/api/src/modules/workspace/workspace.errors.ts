import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors).

export class WorkspaceNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "WORKSPACE_NOT_FOUND";
  constructor(id: string) {
    super(`Workspace ${id} not found`);
    this.name = "WorkspaceNotFoundError";
  }
}

/** A user must always have a workspace, or there is no sheet to show. */
export class LastWorkspaceError extends DomainError {
  readonly kind = "conflict";
  readonly code = "WORKSPACE_LAST";
  constructor() {
    super("The owner's last workspace cannot be deleted");
    this.name = "LastWorkspaceError";
  }
}
