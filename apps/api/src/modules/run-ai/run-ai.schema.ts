import { z } from "zod";

// Single source of truth for the run-ai shapes. The wire vocabulary is
// lowercase ("pending", ...); the database enum is its uppercase mirror. The
// 1:1 case mapping lives here and nowhere else (same rule as
// spreadsheet.schema.ts).

export const RUN_AI_STATUSES_WIRE = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export const runAiStatusWire = z.enum(RUN_AI_STATUSES_WIRE);
export type RunAiStatusWire = z.infer<typeof runAiStatusWire>;
export type RunAiStatusDb = Uppercase<RunAiStatusWire>;
export const toDbRunAiStatus = (status: RunAiStatusWire): RunAiStatusDb =>
  status.toUpperCase() as RunAiStatusDb;
export const toWireRunAiStatus = (status: string): RunAiStatusWire =>
  status.toLowerCase() as RunAiStatusWire;

/** Free-form JSON object written by `complete` / `fail`: model text + usage,
 * or an error description. */
export const runAiResultSchema = z.record(z.string(), z.unknown());
export type RunAiResult = z.infer<typeof runAiResultSchema>;

/* -------------------------------------------------------------- outputs */

export const runAiSchema = z.object({
  id: z.string(),
  /** Scoped Cell pk "<sheetId>.cell.<r>.<c>" — never the short wire id. */
  cellId: z.string(),
  batchId: z.string(),
  status: runAiStatusWire,
  credit: z.number().int(),
  result: runAiResultSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type RunAi = z.infer<typeof runAiSchema>;

/* --------------------------------------------------------------- inputs */

const cellId = z.string().trim().min(1, "cellId is required").max(200);
const batchId = z.string().trim().min(1, "batchId is required").max(200);
const credit = z.number().int().min(0);

/** Router input for `listByBatch`; `byId` uses the shared `idInput`. */
export const runAiBatchInput = z.object({ batchId });

// Service-only inputs: no procedure exposes writes. In-process callers (the
// spreadsheet service, a Trigger.dev task) create and transition runs.
export const createRunAiInput = z.object({
  cellId,
  batchId,
  credit: credit.default(0),
});
export const completeRunAiInput = z.object({
  result: runAiResultSchema,
  credit: credit.optional(),
});
export const failRunAiInput = z.object({
  result: runAiResultSchema.optional(),
});

export type RunAiBatchInput = z.infer<typeof runAiBatchInput>;
/** `z.input`: `credit` is optional for callers and defaults in the service. */
export type CreateRunAiInput = z.input<typeof createRunAiInput>;
export type CompleteRunAiInput = z.infer<typeof completeRunAiInput>;
export type FailRunAiInput = z.infer<typeof failRunAiInput>;
