import { VERIFY_ISSUE_CODES } from "@reclit/dashboard-engine";
import { z } from "zod";
import { workspaceIdInput } from "../../common/schema";
import {
  assistantErrorSchema,
  assistantUsageSchema,
} from "../assistant/assistant.schema";
import { widgetInputSchema } from "../dashboard/dashboard.schema";

// Single source of truth for the dashboard generation shapes. Like the
// assistant run, `status` and `phase` are text: lowercase on the wire, their
// uppercase mirror in the database; `source` is an enum with the same 1:1
// case mapping. Everything the progress UI renders — the generation, its log,
// the brief, the result, the stream events — is declared here and nowhere else.

/* --------------------------------------------------------------- statuses */

export const GENERATION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export const generationStatusWire = z.enum(GENERATION_STATUSES);
export type GenerationStatus = z.infer<typeof generationStatusWire>;

export const GENERATION_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "cancelled",
] as const;
export const GENERATION_TERMINAL_STATUSES_DB = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export const isTerminalGenerationStatus = (status: string): boolean =>
  (GENERATION_TERMINAL_STATUSES as readonly string[]).includes(
    status.toLowerCase(),
  );

export const toDbGenerationStatus = (status: GenerationStatus): string =>
  status.toUpperCase();
export const toWireGenerationStatus = (status: string): GenerationStatus =>
  status.toLowerCase() as GenerationStatus;

/* ----------------------------------------------------------------- phases */

/** The stages of one generation, in the order the worker goes through them (`retrying` precedes the second `proposing`). */
export const GENERATION_PHASES = [
  "queued",
  "waiting_for_rows",
  "analyzing",
  "proposing",
  "laying_out",
  "verifying",
  "retrying",
  "applying",
  "done",
] as const;
export const generationPhaseWire = z.enum(GENERATION_PHASES);
export type GenerationPhase = z.infer<typeof generationPhaseWire>;

export const toDbGenerationPhase = (phase: GenerationPhase): string =>
  phase.toUpperCase();
export const toWireGenerationPhase = (phase: string): GenerationPhase =>
  phase.toLowerCase() as GenerationPhase;

/* ----------------------------------------------------------------- source */

export const GENERATION_SOURCES = ["onboarding", "dashboard"] as const;
export const generationSourceWire = z.enum(GENERATION_SOURCES);
export type GenerationSourceWire = z.infer<typeof generationSourceWire>;
export type GenerationSourceDb = Uppercase<GenerationSourceWire>;
export const toDbGenerationSource = (
  source: GenerationSourceWire,
): GenerationSourceDb => source.toUpperCase() as GenerationSourceDb;
export const toWireGenerationSource = (source: string): GenerationSourceWire =>
  source.toLowerCase() as GenerationSourceWire;

/* ------------------------------------------------------------------- caps */

/** A dashboard with fewer cards than this is not worth applying without a retry. */
export const MIN_CARDS = 3;
/** The most cards one proposal may answer with. */
export const MAX_CARDS = 8;
/** Proposal rounds: the first, and one retry with the mistakes fed back. */
export const MAX_ATTEMPTS = 2;
/** How long the task sleeps between looks at the onboarding batch (checkpointed; ≥ 5 s is free). */
export const WAIT_FOR_ROWS_SECONDS = 5;
/** How many looks before the task gives up waiting and analyzes what is filled. */
export const MAX_WAIT_POLLS = 120;
/** A log entry's `detail`, as stored and streamed. */
export const MAX_GENERATION_TEXT = 300;

/* -------------------------------------------------------------------- log */

export const GENERATION_STEP_STATUSES = ["running", "done", "failed"] as const;
export const generationStepStatus = z.enum(GENERATION_STEP_STATUSES);
export type GenerationStepStatus = z.infer<typeof generationStepStatus>;

/** One phase of one attempt, as the progress list shows it. Timestamps are ISO strings (they live in JSON). */
export const generationStepSchema = z.object({
  phase: generationPhaseWire,
  attempt: z.number().int().min(0),
  status: generationStepStatus,
  detail: z.string().max(MAX_GENERATION_TEXT).nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type GenerationStep = z.infer<typeof generationStepSchema>;

/* ------------------------------------------------------------------ brief */

/** What a column is for, in the brief's words — the propose prompt reads it. */
export const BRIEF_COLUMN_USES = [
  "measure",
  "axis",
  "category",
  "identifier",
  "noise",
] as const;
export const briefColumnUse = z.enum(BRIEF_COLUMN_USES);
export type BriefColumnUse = z.infer<typeof briefColumnUse>;

/** The analyze call's answer, parsed strictly from the model's loose JSON. */
export const dashboardBriefSchema = z.object({
  /** One line saying what one row is. */
  subject: z.string().trim().min(1).max(200),
  /** The questions a person responsible for this data asks first, most valuable first. */
  questions: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  columns: z.array(
    z.object({
      name: z.string().trim().min(1).max(200),
      use: briefColumnUse,
      note: z.string().trim().max(200).optional(),
    }),
  ),
});
export type DashboardBrief = z.infer<typeof dashboardBriefSchema>;

/* ------------------------------------------------------------------ cards */

/**
 * A card with its defaults filled, before placement: a dashboard `WidgetInput`
 * without its slot. Each item of the model's answer is first parsed strictly
 * with `proposalCardSchema` (assistant-tools.ts) and then normalised to this.
 */
export const generationCardSchema = widgetInputSchema.pick({
  name: true,
  description: true,
  type: true,
  variant: true,
  height: true,
  column: true,
  query: true,
});
export type GenerationCard = z.infer<typeof generationCardSchema>;

/* ----------------------------------------------------------------- verify */

/** The engine's codes plus the one only the pipeline sees: a card that failed the strict parse. */
export const VERIFY_CODES = [...VERIFY_ISSUE_CODES, "UNPARSABLE"] as const;

/** One thing wrong with one proposed card — the engine's finding, or the parse failure. */
export const verifyIssueSchema = z.object({
  code: z.enum(VERIFY_CODES),
  severity: z.enum(["error", "warn"]),
  cardIndex: z.number().int().min(0),
  cardName: z.string(),
  message: z.string(),
  detail: z.string().optional(),
});
export type VerifyIssue = z.infer<typeof verifyIssueSchema>;

/* ----------------------------------------------------------------- review */

export const REVIEW_VERDICTS = ["keep", "fix", "drop"] as const;
export const reviewVerdict = z.enum(REVIEW_VERDICTS);

/** The review call's answer: the critic's pass/fail with a verdict per card. */
export const dashboardReviewSchema = z.object({
  pass: z.boolean(),
  reasons: z.array(z.string().trim().max(300)).max(8),
  cards: z.array(
    z.object({
      name: z.string().trim().min(1).max(200),
      verdict: reviewVerdict,
      note: z.string().trim().max(200).optional(),
    }),
  ),
});
export type DashboardReview = z.infer<typeof dashboardReviewSchema>;

/* ----------------------------------------------------------------- result */

/** What a finished generation did: how many cards, whether they were applied, and what the checks found. */
export const generationResultSchema = z.object({
  cardCount: z.number().int().min(0),
  applied: z.boolean(),
  attempts: z.number().int().min(1),
  /** The issues of the attempt that was applied (warnings included). */
  issues: z.array(verifyIssueSchema),
  review: dashboardReviewSchema.nullable(),
  /** `no_value`: no card survived the checks, the dashboard was left as it was. */
  reason: z.enum(["ok", "no_value"]),
});
export type GenerationResult = z.infer<typeof generationResultSchema>;

/* -------------------------------------------------------------------- row */

export const dashboardGenerationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  spreadsheetId: z.string(),
  source: generationSourceWire,
  status: generationStatusWire,
  phase: generationPhaseWire,
  attempt: z.number().int().min(0),
  awaitBatchId: z.string().nullable(),
  log: z.array(generationStepSchema),
  brief: dashboardBriefSchema.nullable(),
  result: generationResultSchema.nullable(),
  error: assistantErrorSchema.nullable(),
  model: z.string().nullable(),
  usage: assistantUsageSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type DashboardGeneration = z.infer<typeof dashboardGenerationSchema>;

/** One item of the `dashboardGeneration.onChange` stream. */
export const generationChangeSchema = z.discriminatedUnion("type", [
  /** The workspace's active generation, or null — sent on (re)connect. */
  z.object({
    type: z.literal("snapshot"),
    generation: dashboardGenerationSchema.nullable(),
  }),
  /** One generation as it now is, after an insert or update. */
  z.object({
    type: z.literal("generation"),
    generation: dashboardGenerationSchema,
  }),
  /** The generation finished and nothing is active: the last event, the stream ends. */
  z.object({ type: z.literal("closed") }),
]);
export type GenerationChange = z.infer<typeof generationChangeSchema>;

/** A change plus the SSE event id it is tracked by (`updatedAt` in ms). */
export type GenerationEvent = { id: string; change: GenerationChange };

/* ----------------------------------------------------------------- inputs */

/** Router input for `start`. */
export const startGenerationInput = workspaceIdInput.extend({
  source: generationSourceWire,
});
export type StartGenerationInput = z.infer<typeof startGenerationInput>;

/** Router input for `onChange`. tRPC fills `lastEventId` in on reconnect. */
export const generationChangesInput = workspaceIdInput.extend({
  lastEventId: z.string().nullish(),
});
export type GenerationChangesInput = z.infer<typeof generationChangesInput>;

/** The Trigger.dev `generate-dashboard` payload: the generation to execute. */
export const generationJobPayloadSchema = z.object({
  generationId: z.string().min(1),
});
export type GenerationJobPayload = z.infer<typeof generationJobPayloadSchema>;

// Service inputs. In-process callers (the control service, the task) create
// and transition generations.
export type CreateGenerationInput = {
  workspaceId: string;
  spreadsheetId: string;
  source: GenerationSourceWire;
  awaitBatchId: string | null;
};
export type CompleteGenerationInput = {
  result: GenerationResult;
  model: string | null;
  usage: z.infer<typeof assistantUsageSchema> | null;
};
