import { z } from "zod";
import { idInput, workspaceIdInput } from "../../common/schema";

// Single source of truth for the assistant shapes. Like run-ai, `status` is
// text: lowercase on the wire, its uppercase mirror in the database; `scope`
// and `source` are enums with the same 1:1 case mapping. Everything the
// capsule renders — the run, its steps, the pending confirmation, the stream
// events — is declared here and nowhere else.

/* --------------------------------------------------------------- statuses */

export const ASSISTANT_STATUSES = [
  "pending",
  "thinking",
  "working",
  "awaiting_confirmation",
  "completed",
  "failed",
  "cancelled",
] as const;
export const assistantStatusWire = z.enum(ASSISTANT_STATUSES);
export type AssistantStatus = z.infer<typeof assistantStatusWire>;

export const ASSISTANT_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "cancelled",
] as const;
export const ASSISTANT_TERMINAL_STATUSES_DB = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export const isTerminalAssistantStatus = (status: string): boolean =>
  (ASSISTANT_TERMINAL_STATUSES as readonly string[]).includes(
    status.toLowerCase(),
  );

export const toDbAssistantStatus = (status: AssistantStatus): string =>
  status.toUpperCase();
export const toWireAssistantStatus = (status: string): AssistantStatus =>
  status.toLowerCase() as AssistantStatus;

/* ---------------------------------------------------------- scope, source */

export const ASSISTANT_SCOPES = ["dashboard", "spreadsheet"] as const;
export const assistantScopeWire = z.enum(ASSISTANT_SCOPES);
export type AssistantScopeWire = z.infer<typeof assistantScopeWire>;
export type AssistantScopeDb = Uppercase<AssistantScopeWire>;
export const toDbAssistantScope = (
  scope: AssistantScopeWire,
): AssistantScopeDb => scope.toUpperCase() as AssistantScopeDb;
export const toWireAssistantScope = (scope: string): AssistantScopeWire =>
  scope.toLowerCase() as AssistantScopeWire;

export const ASSISTANT_SOURCES = ["user", "system"] as const;
export const assistantSourceWire = z.enum(ASSISTANT_SOURCES);
export type AssistantSourceWire = z.infer<typeof assistantSourceWire>;
export type AssistantSourceDb = Uppercase<AssistantSourceWire>;
export const toDbAssistantSource = (
  source: AssistantSourceWire,
): AssistantSourceDb => source.toUpperCase() as AssistantSourceDb;
export const toWireAssistantSource = (source: string): AssistantSourceWire =>
  source.toLowerCase() as AssistantSourceWire;

/* ------------------------------------------------------------------- caps */

/** The longest prompt the capsule sends. */
export const MAX_ASSISTANT_PROMPT = 2000;
/** Model calls per run: the loop stops with a summary after this many. */
export const MAX_ASSISTANT_STEPS = 12;
/** Tool calls per run, across every model step. */
export const MAX_ASSISTANT_TOOL_CALLS = 20;
/** Cell values one run may write, across `setCells` and `fillColumn`. */
export const MAX_ASSISTANT_CELL_WRITES = 2000;
/** The model's closing message, as stored and streamed. */
export const MAX_ASSISTANT_SUMMARY = 2000;
/** A step's `summary` / `error`, as stored and streamed. */
export const MAX_ASSISTANT_STEP_TEXT = 300;
/** The stored conversation, in bytes of JSON; older tool outputs are dropped first. */
export const MAX_ASSISTANT_TRANSCRIPT_BYTES = 64 * 1024;
/** How long a delete may wait for the user before the run cancels itself. */
export const ASSISTANT_CONFIRMATION_TIMEOUT = "10m";

/* ------------------------------------------------------------------ tools */

const SHARED_TOOLS = ["readRows", "getColumnSummary"] as const;
export const ASSISTANT_SPREADSHEET_TOOLS = [
  ...SHARED_TOOLS,
  "createColumn",
  "updateColumn",
  "reorderColumn",
  "setCells",
  "fillColumn",
  "appendRows",
  "removeColumn",
  "removeRows",
] as const;
export const ASSISTANT_DASHBOARD_TOOLS = [
  ...SHARED_TOOLS,
  "createWidget",
  "updateWidget",
  "updateDashboard",
  "removeWidget",
] as const;
export const ASSISTANT_TOOL_NAMES = [
  ...ASSISTANT_SPREADSHEET_TOOLS,
  "createWidget",
  "updateWidget",
  "updateDashboard",
  "removeWidget",
] as const;
export const assistantToolName = z.enum(ASSISTANT_TOOL_NAMES);
export type AssistantToolName = z.infer<typeof assistantToolName>;

/** The tools that delete something: each one pauses the run for the user. */
export const ASSISTANT_DESTRUCTIVE_TOOLS = [
  "removeColumn",
  "removeRows",
  "removeWidget",
] as const;
export const assistantDestructiveToolName = z.enum(ASSISTANT_DESTRUCTIVE_TOOLS);
export type AssistantDestructiveToolName = z.infer<
  typeof assistantDestructiveToolName
>;
export const isDestructiveTool = (
  tool: string,
): tool is AssistantDestructiveToolName =>
  (ASSISTANT_DESTRUCTIVE_TOOLS as readonly string[]).includes(tool);

export const toolsForScope = (
  scope: AssistantScopeWire,
): readonly AssistantToolName[] =>
  scope === "dashboard"
    ? ASSISTANT_DASHBOARD_TOOLS
    : ASSISTANT_SPREADSHEET_TOOLS;

/* ---------------------------------------------------------------- outputs */

/** A summarised tool input: identifiers and counts, never raw cell lists. */
const stepInput = z.record(z.string(), z.unknown());

export const ASSISTANT_STEP_STATUSES = [
  "running",
  "done",
  "failed",
  "declined",
] as const;
export const assistantStepStatus = z.enum(ASSISTANT_STEP_STATUSES);
export type AssistantStepStatus = z.infer<typeof assistantStepStatus>;

/** One tool call of a run, as the capsule lists it. Timestamps are ISO strings (they live in JSON). */
export const assistantStepSchema = z.object({
  index: z.number().int().min(0),
  tool: assistantToolName,
  input: stepInput,
  status: assistantStepStatus,
  /** Whether the call changed the sheet or the dashboard — what the page refreshes on. */
  mutated: z.boolean(),
  summary: z.string().max(MAX_ASSISTANT_STEP_TEXT).nullable(),
  error: z.string().max(MAX_ASSISTANT_STEP_TEXT).nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type AssistantStep = z.infer<typeof assistantStepSchema>;

/** The delete waiting for the user while the status is `awaiting_confirmation`. */
export const assistantPendingActionSchema = z.object({
  stepIndex: z.number().int().min(0),
  tool: assistantDestructiveToolName,
  input: stepInput,
  /** The Trigger.dev waitpoint token the worker is suspended on. */
  tokenId: z.string(),
  requestedAt: z.string(),
  /** Set by `respond`; the worker clears the whole action when it resumes. */
  response: z.object({ approved: z.boolean(), at: z.string() }).nullable(),
});
export type AssistantPendingAction = z.infer<
  typeof assistantPendingActionSchema
>;

export const assistantUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});
export type AssistantUsage = z.infer<typeof assistantUsageSchema>;

export const assistantErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
});
export type AssistantError = z.infer<typeof assistantErrorSchema>;

export const assistantRunSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  spreadsheetId: z.string().nullable(),
  scope: assistantScopeWire,
  source: assistantSourceWire,
  prompt: z.string(),
  status: assistantStatusWire,
  steps: z.array(assistantStepSchema),
  pendingAction: assistantPendingActionSchema.nullable(),
  /** The model's closing message — data, shown as plain text. */
  summary: z.string().nullable(),
  error: assistantErrorSchema.nullable(),
  model: z.string().nullable(),
  usage: assistantUsageSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AssistantRun = z.infer<typeof assistantRunSchema>;

/** One item of the `assistant.onChange` stream. */
export const assistantChangeSchema = z.discriminatedUnion("type", [
  /** The workspace's active run, or null — sent on (re)connect. */
  z.object({ type: z.literal("snapshot"), run: assistantRunSchema.nullable() }),
  /** One run as it now is, after an insert or update. */
  z.object({ type: z.literal("run"), run: assistantRunSchema }),
  /** The run finished and nothing is active: the last event, the stream ends. */
  z.object({ type: z.literal("closed") }),
]);
export type AssistantChange = z.infer<typeof assistantChangeSchema>;

/** A change plus the SSE event id it is tracked by (`updatedAt` in ms). */
export type AssistantEvent = { id: string; change: AssistantChange };

/** What `POST /assistant/transcribe` answers. */
export const assistantTranscriptionSchema = z.object({
  text: z.string(),
  languageCode: z.string().nullable(),
});
export type AssistantTranscription = z.infer<
  typeof assistantTranscriptionSchema
>;

/* ----------------------------------------------------------------- inputs */

const prompt = z
  .string()
  .trim()
  .min(1, "Prompt is required")
  .max(MAX_ASSISTANT_PROMPT);

/** Router input for `start`. The tRPC caller is always a person. */
export const startAssistantInput = workspaceIdInput.extend({
  scope: assistantScopeWire,
  prompt,
});
export type StartAssistantInput = z.infer<typeof startAssistantInput>;

/** Router input for `respond`. */
export const respondAssistantInput = idInput.extend({ approved: z.boolean() });
export type RespondAssistantInput = z.infer<typeof respondAssistantInput>;

/** Router input for `onChange`. tRPC fills `lastEventId` in on reconnect. */
export const assistantChangesInput = workspaceIdInput.extend({
  lastEventId: z.string().nullish(),
});
export type AssistantChangesInput = z.infer<typeof assistantChangesInput>;

/** The Trigger.dev `assistant-run` payload: the run to execute. */
export const assistantJobPayloadSchema = z.object({ runId: z.string().min(1) });
export type AssistantJobPayload = z.infer<typeof assistantJobPayloadSchema>;

// Service inputs. In-process callers (the control service, the task) create
// and transition runs.
export type CreateAssistantRunInput = {
  workspaceId: string;
  spreadsheetId: string;
  scope: AssistantScopeWire;
  source: AssistantSourceWire;
  prompt: string;
};
export type FinishAssistantStepInput = {
  status: Exclude<AssistantStepStatus, "running">;
  mutated: boolean;
  /** The summarised input with what only execution knew (counts, ids); replaces the step's. */
  input?: Record<string, unknown>;
  summary?: string | null;
  error?: string | null;
};
export type CompleteAssistantRunInput = {
  summary: string | null;
  model: string | null;
  usage: AssistantUsage | null;
};
