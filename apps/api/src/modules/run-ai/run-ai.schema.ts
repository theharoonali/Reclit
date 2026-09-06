import { z } from "zod";
import { idInput } from "../../common/schema";
import {
  cellValueSchema,
  columnTypeWire,
  gridIndex,
  sheetRowCellSchema,
} from "../spreadsheet/spreadsheet.schema";

// Single source of truth for the run-ai shapes. Status is free text: the
// wire vocabulary is lowercase ("pending", "analyzing", ...); the database
// stores its uppercase mirror. The 1:1 case mapping lives here and nowhere
// else (same rule as spreadsheet.schema.ts).

/**
 * The system assigns `pending`, `running`, `completed`, `failed`; anything
 * else is a custom working stage. Only these two end a run.
 */
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
export const toDbRunAiStatus = (status: string): string => status.toUpperCase();
export const toWireRunAiStatus = (status: string): string =>
  status.toLowerCase();

/**
 * What a run is given: the column's prompt (the instruction), the target
 * column, and the whole row in the sheet's column sort order — every column,
 * blank cells as `null`, the target included with its current value. Audio
 * and file cells carry their URL as text. From the second AI column of a row
 * on, `previous` is the previous AI column with the value it produced. Built
 * by `RunAiBatchService.prepare` right before the cell runs, stored as
 * `result.input`, and sent to the worker as the job payload.
 */
export const runAiInputSchema = z.object({
  prompt: z.string(),
  target: z.object({
    id: z.string(), // "col.<index>"
    index: z.number().int(),
    name: z.string(),
    type: columnTypeWire,
  }),
  row: z.object({
    id: z.string(), // "row.<index>"
    index: z.number().int(),
    cells: z.array(sheetRowCellSchema),
  }),
  previous: sheetRowCellSchema.optional(),
});
export type RunAiInput = z.infer<typeof runAiInputSchema>;
export type RunAiInputCell = RunAiInput["row"]["cells"][number];

/** The Trigger.dev `run-ai-cell` payload: which run, and what it was given. */
export const runAiJobPayloadSchema = z.object({
  runId: z.string().min(1),
  input: runAiInputSchema,
});
export type RunAiJobPayload = z.infer<typeof runAiJobPayloadSchema>;

/** One column wave of a batch: the cells of one AI column, one per selected row. */
const runAiWaveSchema = z.object({
  columnIndex: z.number().int(),
  columnName: z.string(),
  cells: z
    .array(z.object({ runId: z.string().min(1), rowIndex: z.number().int() }))
    .min(1),
});

/**
 * The Trigger.dev `run-ai-batch` payload — one per Run click: every wave of
 * the batch in column sort order. The orchestrator prepares and runs one wave
 * at a time, so a wave sees the answers of the waves before it.
 */
export const runAiBatchJobSchema = z.object({
  batchId: z.string().min(1),
  spreadsheetId: z.string().min(1),
  waves: z.array(runAiWaveSchema).min(1),
});
export type RunAiBatchJob = z.infer<typeof runAiBatchJobSchema>;
export type RunAiWave = z.infer<typeof runAiWaveSchema>;

/**
 * Free-form JSON object on the run. `input` is what the run was given
 * (written on create); `output`, when present, is the value the run produced
 * for its cell — a plain cell value — and `complete` writes it into the Cell
 * row. Everything else (`model`, `usage`, `error: { name, message }`) is
 * kept as-is.
 */
export const runAiResultSchema = z
  .object({
    input: runAiInputSchema.optional(),
    output: cellValueSchema.optional(),
  })
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

/** The most rows one Run click may take — Trigger.dev's batch cap. */
export const MAX_RUN_AI_BATCH_ROWS = 1000;
/** The most columns one Run click may name — the import cap. */
export const MAX_RUN_AI_BATCH_COLUMNS = 256;
/** The most runs one Run click may create: rows × runnable columns. */
export const MAX_RUN_AI_BATCH_CELLS = 5000;

/**
 * Router input for `runCells`: the sheet id plus the rows and the columns of
 * the selected rectangle (wire indexes). Columns that are not AI columns with
 * a prompt are skipped by the service.
 */
export const runAiCellsInput = idInput.extend({
  rowIndexes: z.array(gridIndex).min(1).max(MAX_RUN_AI_BATCH_ROWS),
  columnIndexes: z.array(gridIndex).min(1).max(MAX_RUN_AI_BATCH_COLUMNS),
});

// Service inputs. In-process callers (`runCells`, the Trigger.dev tasks)
// create and transition runs.
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
  /** What the run starts with; `runCells` leaves it empty until the cell is prepared. */
  result: runAiResultSchema.optional(),
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

export type RunAiChangesInput = z.infer<typeof runAiChangesInput>;
export type RunAiCellsInput = z.infer<typeof runAiCellsInput>;
/** `z.input`: `credit` is optional for callers and defaults in the service. */
export type CreateRunAiInput = z.input<typeof createRunAiInput>;
export type SetRunAiStatusInput = z.infer<typeof setRunAiStatusInput>;
export type CompleteRunAiInput = z.infer<typeof completeRunAiInput>;
export type FailRunAiInput = z.infer<typeof failRunAiInput>;
