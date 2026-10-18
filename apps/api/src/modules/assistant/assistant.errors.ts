import { DomainError } from "../../common/errors";

// Named domain errors (docs/rules/BACKEND.md §Errors). A workspace without a
// sheet reuses `SpreadsheetNotFoundError` from the spreadsheet feature.

export class AssistantNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "ASSISTANT_NOT_FOUND";
  constructor(id: string) {
    super(`Assistant run ${id} not found`);
    this.name = "AssistantNotFoundError";
  }
}

/** The workspace already has a run that is not finished (partial unique index `AssistantRun_active_workspace_key`). */
export class AssistantBusyError extends DomainError {
  readonly kind = "conflict";
  readonly code = "ASSISTANT_BUSY";
  constructor(workspaceId: string) {
    super(`Workspace ${workspaceId} already has an assistant run in progress`);
    this.name = "AssistantBusyError";
  }
}

/** `respond` on a run that is not waiting for a confirmation, or whose confirmation was already answered or timed out. */
export class AssistantNotAwaitingError extends DomainError {
  readonly kind = "conflict";
  readonly code = "ASSISTANT_NOT_AWAITING";
  constructor(id: string, cause?: string) {
    super(
      `Assistant run ${id} is not waiting for a confirmation${cause ? `: ${cause}` : ""}`,
    );
    this.name = "AssistantNotAwaitingError";
  }
}

/** A transition on a run that already reached `completed` / `failed` / `cancelled`. */
export class AssistantFinishedError extends DomainError {
  readonly kind = "conflict";
  readonly code = "ASSISTANT_FINISHED";
  constructor(id: string) {
    super(`Assistant run ${id} has already finished`);
    this.name = "AssistantFinishedError";
  }
}

/** The run was recorded but the worker could not be asked to execute it. */
export class AssistantDispatchError extends DomainError {
  readonly kind = "upstream";
  readonly code = "ASSISTANT_DISPATCH_FAILED";
  constructor(id: string, cause: string) {
    super(`Assistant run ${id} could not be enqueued: ${cause}`);
    this.name = "AssistantDispatchError";
  }
}

/** `POST /assistant/transcribe` without an `ELEVENLABS_API_KEY` on the api. */
export class AssistantTranscriptionUnavailableError extends DomainError {
  readonly kind = "unavailable";
  readonly code = "ASSISTANT_TRANSCRIPTION_UNAVAILABLE";
  constructor() {
    super("Speech-to-text is not configured: ELEVENLABS_API_KEY is not set");
    this.name = "AssistantTranscriptionUnavailableError";
  }
}

/** The upload is not audio, or is larger than the transcription cap. */
export class AssistantTranscriptionInvalidError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "ASSISTANT_TRANSCRIPTION_INVALID";
  constructor(reason: string) {
    super(`The recording cannot be transcribed: ${reason}`);
    this.name = "AssistantTranscriptionInvalidError";
  }
}

/** `assistant.recommendWidgets` without a `GOOGLE_GENERATIVE_AI_API_KEY` on the api. */
export class AssistantRecommendationsUnavailableError extends DomainError {
  readonly kind = "unavailable";
  readonly code = "ASSISTANT_RECOMMENDATIONS_UNAVAILABLE";
  constructor() {
    super(
      "AI recommendations are not configured: GOOGLE_GENERATIVE_AI_API_KEY is not set",
    );
    this.name = "AssistantRecommendationsUnavailableError";
  }
}

/** The model refused or failed the recommendation call, or answered nothing usable. */
export class AssistantRecommendationsFailedError extends DomainError {
  readonly kind = "upstream";
  readonly code = "ASSISTANT_RECOMMENDATIONS_FAILED";
  constructor(cause: string) {
    super(`AI recommendations failed: ${cause}`);
    this.name = "AssistantRecommendationsFailedError";
  }
}

/** ElevenLabs refused or failed the transcription. */
export class AssistantTranscriptionFailedError extends DomainError {
  readonly kind = "upstream";
  readonly code = "ASSISTANT_TRANSCRIPTION_FAILED";
  constructor(cause: string) {
    super(`Speech-to-text failed: ${cause}`);
    this.name = "AssistantTranscriptionFailedError";
  }
}
