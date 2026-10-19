import { z } from "zod";
import { idInput } from "../../common/schema";
import { runAiSchema } from "../run-ai/run-ai.schema";
import {
  cellValueSchema,
  columnTypeWire,
  sheetRowSchema,
} from "../spreadsheet/spreadsheet.schema";

// Populate = filling a sheet from outside the grid: the public form and the
// REST API share these shapes. Fields are addressed by column *name* — what a
// caller sees — never by index.

export const populateFieldSchema = z.object({
  name: z.string(),
  type: columnTypeWire,
  columnIndex: z.number().int(),
});

/**
 * What a form needs to render: the sheet's name, its fillable columns, and —
 * for the output column the form may show — the AI columns a submission
 * fills, with whether the sheet shows them to the visitor.
 */
export const populateFormSchema = z.object({
  spreadsheet: z.object({ id: z.string(), name: z.string() }),
  fields: z.array(populateFieldSchema),
  /** The sheet's "Enable output" switch (`Spreadsheet.formOutputEnabled`). */
  outputEnabled: z.boolean(),
  /** The runnable AI columns, in display order — listed whether or not shown. */
  outputs: z.array(populateFieldSchema),
});

export const MAX_POPULATE_FIELDS = 256;

/** `null` entries write no cell; at least one entry must carry a value. */
export const populateSubmitInput = idInput.extend({
  fields: z
    .record(z.string().min(1).max(200), cellValueSchema)
    .refine((fields) => Object.keys(fields).length <= MAX_POPULATE_FIELDS, {
      message: `At most ${MAX_POPULATE_FIELDS} fields`,
    })
    .refine((fields) => Object.values(fields).some((value) => value !== null), {
      message: "At least one field needs a value",
    }),
});

/** The admin's switch: whether visitors watch their row's AI columns fill in. */
export const populateSetOutputInput = idInput.extend({
  enabled: z.boolean(),
});

/**
 * The saved row, the runs it started, and — when starting them failed — why.
 * `runError` never fails the submission: the row is already saved.
 */
export const populateSubmissionSchema = z.object({
  row: sheetRowSchema,
  runs: z.array(runAiSchema),
  runError: z.object({ code: z.string(), message: z.string() }).nullable(),
});

export type PopulateField = z.infer<typeof populateFieldSchema>;
export type PopulateForm = z.infer<typeof populateFormSchema>;
export type PopulateSubmitInput = z.infer<typeof populateSubmitInput>;
export type PopulateSetOutputInput = z.infer<typeof populateSetOutputInput>;
export type PopulateSubmission = z.infer<typeof populateSubmissionSchema>;
