import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";

/**
 * The assistant run as it crosses the wire — type-only aliases of the
 * contract (`apps/api/src/__tests__/assistant.api.test.ts`), never
 * hand-written shapes. Nothing here imports React.
 */

export type AssistantRun = RouterOutputs["assistant"]["byId"];
export type AssistantStatus = AssistantRun["status"];
export type TerminalStatus = Extract<
  AssistantStatus,
  "completed" | "failed" | "cancelled"
>;
export type AssistantStep = AssistantRun["steps"][number];
export type PendingAction = NonNullable<AssistantRun["pendingAction"]>;
/** The tools whose call pauses the run for a Delete / Keep answer. */
export type DestructiveTool = PendingAction["tool"];

/** Keys under `assistant.errors` in `en.json`. */
export type AssistantErrorKey =
  | "busy"
  | "dispatch"
  | "transcriptionUnavailable"
  | "transcriptionFailed"
  | "micDenied"
  | "micUnsupported"
  | "unknown";
