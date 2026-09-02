import { z } from "zod";
import { cellValueSchema } from "../spreadsheet/spreadsheet.schema";

// Single source of truth for the run-ai shapes. Status is free text: the
// wire vocabulary is lowercase ("pending", "analyzing", ...); the database
// stores its uppercase mirror. The 1:1 case mapping lives here and nowhere
// else (same rule as spreadsheet.schema.ts).

/** The statuses the system itself assigns; anything else is a custom stage. */
export const RUN_AI_STATUSES_WIRE = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type RunAiKnownStatus = (typeof RUN_AI_STATUSES_WIRE)[number];

/** The only statuses that end a run. Every other value means "working". */
export const RUN_AI_TERMINAL_STATUSES = ["completed", "failed"] as const;
export const RUN_AI_TERMINAL_STATUSES_DB = ["COMPLETED", "FAILED"] as const;

export const isTerminalRunAiStatus = (status: string): boolean =>
  (RUN_AI_TERMINAL_STATUSES as readonly string[]).includes(
    status.toLowerCase(),
  );

/** A single word: letters, digits, `_`, `-`. Case-insensitive on input. */
export const runAiStatusWire = z
  .string()
  .trim()
  .min(1, "status is required")
  .max(50)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "status must be a single word")
  .transform((status) => status.toLowerCase());
export type RunAiStatusWire = z.infer<typeof runAiStatusWire>;
export const toDbRunAiStatus = (status: string): string => status.toUpperCase();
export const toWireRunAiStatus = (status: string): string =>
  status.toLowerCase();

/**
 * Free-form JSON object written by `complete` / `fail`. `output`, when
 * present, is the value the run produced for its cell — a plain cell value —
 * and `complete` writes it into the Cell row. Everything else (model text,
 * usage, an error description) is kept as-is.
 */
export const runAiResultSchema = z
  .object({ output: cellValueSchema.optional() })
  .catchall(z.unknown());
export type RunAiResult = z.infer<typeof runAiResultSchema>;

/* -------------------------------------------------------------- outputs */

export const runAiSchema = z.object({
  id: z.string(),
  /** Scoped Cell pk "<sheetId>.cell.<r>.<c>" — never the short wire id. */
  cellId: z.string(),
  /** The sheet half of `cellId`, denormalised for per-sheet queries. */
  spreadsheetId: z.string(),
  batchId: z.string(),
  status: z.string(),
  credit: z.number().int(),
  result: runAiResultSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type RunAi = z.infer<typeof runAiSchema>;

/** One item of the `runAi.onChange` stream. */
export const runAiChangeSchema = z.discriminatedUnion("type", [
  /** Every working run of the sheet, newest per cell — sent on (re)connect. */
  z.object({ type: z.literal("snapshot"), runs: z.array(runAiSchema) }),
  /** One run as it now is, after an insert or update. */
  z.object({ type: z.literal("run"), run: runAiSchema }),
  /** The last run finished: nothing is working, this is the last event and the stream ends. */
  z.object({ type: z.literal("closed") }),
]);
export type RunAiChange = z.infer<typeof runAiChangeSchema>;

/** A change plus the SSE event id it is tracked by (`updatedAt` in ms). */
export type RunAiEvent = { id: string; change: RunAiChange };

/* --------------------------------------------------------------- inputs */

const cellId = z.string().trim().min(1, "cellId is required").max(200);
const batchId = z.string().trim().min(1, "batchId is required").max(200);
const spreadsheetId = z
  .string()
  .trim()
  .min(1, "spreadsheetId is required")
  .max(200);
const credit = z.number().int().min(0);

/** Router input for `listByBatch`; `byId` uses the shared `idInput`. */
export const runAiBatchInput = z.object({ batchId });

/** Router input for `listActive`. */
export const runAiSheetInput = z.object({ spreadsheetId });

/** Router input for `onChange`. tRPC fills `lastEventId` in on reconnect. */
export const runAiChangesInput = runAiSheetInput.extend({
  lastEventId: z.string().nullish(),
});

// Service inputs. In-process callers (the spreadsheet service, a Trigger.dev
// task) and the REST test endpoint create and transition runs.
export const createRunAiInput = z.object({
  cellId,
  batchId,
  credit: credit.default(0),
  /** A working status to start in; defaults to `pending`. Never terminal. */
  status: runAiStatusWire
    .refine((status) => !isTerminalRunAiStatus(status), {
      message: "a new run cannot start in a terminal status",
    })
    .optional(),
});
export const setRunAiStatusInput = z.object({
  status: runAiStatusWire,
  result: runAiResultSchema.optional(),
  credit: credit.optional(),
});
export const completeRunAiInput = z.object({
  result: runAiResultSchema,
  credit: credit.optional(),
});
export const failRunAiInput = z.object({
  result: runAiResultSchema.optional(),
});

/**
 * `POST /run-ai/test`: with `id` transitions that run (`status` required);
 * with `cellId` transitions the cell's working run when there is one and a
 * `status` is given, or creates one (`batchId` minted when absent).
 */
export const upsertRunAiTestInput = z
  .object({
    id: z.string().trim().min(1).max(200).optional(),
    cellId: cellId.optional(),
    batchId: batchId.optional(),
    status: runAiStatusWire.optional(),
    result: runAiResultSchema.optional(),
    credit: credit.optional(),
  })
  .refine((input) => input.id !== undefined || input.cellId !== undefined, {
    message: "cellId is required when id is absent",
    path: ["cellId"],
  })
  .refine((input) => input.id === undefined || input.status !== undefined, {
    message: "status is required when id is present",
    path: ["status"],
  });

export type RunAiBatchInput = z.infer<typeof runAiBatchInput>;
export type RunAiSheetInput = z.infer<typeof runAiSheetInput>;
export type RunAiChangesInput = z.infer<typeof runAiChangesInput>;
/** `z.input`: `credit` is optional for callers and defaults in the service. */
export type CreateRunAiInput = z.input<typeof createRunAiInput>;
export type SetRunAiStatusInput = z.infer<typeof setRunAiStatusInput>;
export type CompleteRunAiInput = z.infer<typeof completeRunAiInput>;
export type FailRunAiInput = z.infer<typeof failRunAiInput>;
export type UpsertRunAiTestInput = z.infer<typeof upsertRunAiTestInput>;
